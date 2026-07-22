import { Router } from 'express';
import Joi from 'joi';
import { Exam } from '../../models/Exam';
import { Subject } from '../../models/Subject';
import { ClassModel } from '../../models/Class';
import { User } from '../../models/User';
import { Student } from '../../models/Student';
import { authenticate, authorize } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { createResponse, createError } from '../../helpers/response';
import { paginationSchema } from '../../validators/pagination';
import { listRecordFilter } from '../../utils/recordVisibility';
import { subjectBelongsToClass, teacherCanTeachClassSubject } from '../../services/timetableValidationService';
import { TeacherProfile } from '../../models/Teacher';

const router = Router();

const examSchema = Joi.object({
  body: Joi.object({
    title: Joi.string().required(),
    subject: Joi.string().hex().length(24).required(),
    class: Joi.string().hex().length(24).required(),
    teacherId: Joi.string().hex().length(24).optional(),
    date: Joi.date().required(),
    totalMarks: Joi.number().min(1).default(100),
    passingMarks: Joi.number().min(1).optional(),
    examType: Joi.string().valid('weekly', 'monthly', 'book').required(),
    onlineExamUrl: Joi.string().uri().allow('', null).optional(),
    googleFormUrl: Joi.string().uri().allow('', null).optional(),
    status: Joi.string().valid('draft', 'published').optional()
  })
});

const examUpdateSchema = Joi.object({
  body: Joi.object({
    title: Joi.string().optional(),
    subject: Joi.string().hex().length(24).optional(),
    class: Joi.string().hex().length(24).optional(),
    teacherId: Joi.string().hex().length(24).optional(),
    date: Joi.date().optional(),
    totalMarks: Joi.number().min(1).optional(),
    passingMarks: Joi.number().min(1).optional(),
    examType: Joi.string().valid('weekly', 'monthly', 'book').optional(),
    onlineExamUrl: Joi.string().uri().allow('', null).optional(),
    googleFormUrl: Joi.string().uri().allow('', null).optional(),
    status: Joi.string().valid('draft', 'published').optional()
  }).min(1)
});

const readRoles = ['super_admin', 'admin', 'branch_manager', 'teacher', 'student', 'parent', 'owner'];
const writeRoles = ['super_admin', 'admin', 'branch_manager', 'teacher'];
const deleteRoles = ['super_admin', 'admin'];

function buildExamCode(title: string) {
  const slug = title
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 18) || 'EXAM';

  return `${slug}-${Date.now().toString().slice(-6)}`;
}

function idsEqual(left: unknown, right: unknown) {
  return String(left ?? '') === String(right ?? '');
}

async function ensureExamRelations(subjectId: string, classId: string, teacherId: string) {
  const [subject, klass, teacher, teacherProfile] = await Promise.all([
    Subject.findOne({ _id: subjectId, isDeleted: false }).lean<any>(),
    ClassModel.findOne({ _id: classId, isDeleted: false }).lean<any>(),
    User.findOne({ _id: teacherId, role: 'teacher', isDeleted: false }).lean<any>(),
    TeacherProfile.findOne({ userId: teacherId, isDeleted: false }).lean<any>()
  ]);

  if (!subject || Array.isArray(subject)) return 'Subject not found';
  if (!klass || Array.isArray(klass)) return 'Class not found';
  if (!teacher || Array.isArray(teacher) || teacher.role !== 'teacher') return 'Teacher not found';
  if (!subjectBelongsToClass(subject, klass)) {
    return 'Selected subject does not belong to the selected class';
  }

  const mergedTeacher = {
    ...teacher,
    assignedSubjects: [
      ...(Array.isArray(teacher.assignedSubjects) ? teacher.assignedSubjects : []),
      ...(Array.isArray(teacherProfile?.assignedSubjectIds) ? teacherProfile.assignedSubjectIds : [])
    ],
    assignedClasses: [
      ...(Array.isArray(teacher.assignedClasses) ? teacher.assignedClasses : []),
      ...(Array.isArray(teacherProfile?.assignedClassIds) ? teacherProfile.assignedClassIds : [])
    ]
  };

  if (teacherCanTeachClassSubject(mergedTeacher, klass, subject)) {
    return null;
  }

  // Teachers assigned to the class may create exams for any subject linked to that class.
  const assignedClassIds = (mergedTeacher.assignedClasses as unknown[]).map((item) =>
    String((item as { _id?: unknown })?._id ?? item)
  );
  const classTeacherIds = Array.isArray(klass.assignedTeachers)
    ? klass.assignedTeachers.map((item: any) => String(item?._id ?? item))
    : [];
  const teachesClass =
    (klass.teacherId && String(klass.teacherId) === String(teacher._id)) ||
    classTeacherIds.includes(String(teacher._id)) ||
    assignedClassIds.includes(String(klass._id));

  if (teachesClass) {
    return null;
  }

  return 'Selected teacher is not assigned to the selected subject';
}

function serializeExam(exam: any) {
  const googleFormUrl = String(exam?.googleFormUrl ?? '').trim();
  const onlineExamUrl = String(exam?.onlineExamUrl ?? '').trim();
  const mode = googleFormUrl || onlineExamUrl ? 'online' : 'in_person';
  return {
    ...exam,
    subjectName: exam?.subject?.title ?? exam?.subjectName ?? exam?.subjectTitle ?? '',
    className: exam?.class?.className ?? exam?.class?.name ?? exam?.className ?? '',
    teacherName: exam?.teacherId?.name ?? exam?.teacher?.name ?? exam?.teacherName ?? '',
    googleFormUrl,
    onlineExamUrl,
    examUrl: onlineExamUrl || googleFormUrl || '',
    mode,
    deliveryMode: mode
  };
}

async function resolveScopedStudentAssignment(userId: string) {
  const currentUser = await User.findById(userId).select('studentId classId subjectId').lean<any>();
  const linkedStudent = currentUser?.studentId
    ? await Student.findOne({ studentId: currentUser.studentId, isDeleted: false }).select('classId subjectId').lean<any>()
    : null;

  return {
    classId: linkedStudent?.classId ?? currentUser?.classId ?? null,
    subjectId: linkedStudent?.subjectId ?? currentUser?.subjectId ?? null
  };
}

router.use(authenticate);

router.post('/', authorize(writeRoles), validate(examSchema), async (req, res, next) => {
  try {
    const teacherId = req.body.teacherId ?? (req.user?.canonicalRole === 'teacher' ? req.user.userId : null);
    if (!teacherId) {
      return res.status(400).json(createError('Teacher is required'));
    }

    const relationError = await ensureExamRelations(req.body.subject, req.body.class, teacherId);
    if (relationError) {
      return res.status(400).json(createError(relationError));
    }

    const subjectDoc = await Subject.findById(req.body.subject).select('branchId').lean<any>();

    const exam = await Exam.create({
      ...req.body,
      teacherId,
      totalMarks: Number(req.body.totalMarks ?? 100) || 100,
      passingMarks: Number(req.body.passingMarks ?? 60) || 60,
      branchId: subjectDoc?.branchId ?? null,
      examCode: buildExamCode(req.body.title),
      publishedAt: req.body.status === 'published' ? new Date() : null
    });

    const populated = await Exam.findById(exam._id)
      .populate('subject', 'title code')
      .populate('class', 'className name classCode')
      .populate('teacherId', 'name email')
      .lean();

    res.status(201).json(createResponse(serializeExam(populated), 'Exam created successfully'));
  } catch (error) {
    next(error);
  }
});

router.put('/:id', authorize(writeRoles), validate(examUpdateSchema), async (req, res, next) => {
  try {
    const currentExam = await Exam.findById(req.params.id).lean<any>();
    if (!currentExam) {
      return res.status(404).json(createError('Exam not found'));
    }

    if (req.user?.canonicalRole === 'teacher' && String(currentExam.teacherId) !== String(req.user.userId)) {
      return res.status(403).json(createError('Teachers can only edit their own exams'));
    }

    const nextSubject = req.body.subject ?? String(currentExam.subject);
    const nextClass = req.body.class ?? String(currentExam.class);
    const nextTeacherId = req.body.teacherId ?? String(currentExam.teacherId);

    const relationError = await ensureExamRelations(nextSubject, nextClass, nextTeacherId);
    if (relationError) {
      return res.status(400).json(createError(relationError));
    }

    const subjectDoc = await Subject.findById(nextSubject).select('branchId').lean<any>();

    const nextStatus = req.body.status ?? currentExam.status;
    const updatePayload: Record<string, unknown> = {
      ...req.body,
      teacherId: nextTeacherId,
      branchId: subjectDoc?.branchId ?? currentExam.branchId ?? null,
      publishedAt: nextStatus === 'published' ? currentExam.publishedAt ?? new Date() : null
    };

    // Keep online/in-person mode consistent with submitted link fields.
    if (Object.prototype.hasOwnProperty.call(req.body, 'googleFormUrl') ||
      Object.prototype.hasOwnProperty.call(req.body, 'onlineExamUrl')) {
      const nextGoogle = Object.prototype.hasOwnProperty.call(req.body, 'googleFormUrl')
        ? String(req.body.googleFormUrl ?? '').trim()
        : String(currentExam.googleFormUrl ?? '').trim();
      const nextOnline = Object.prototype.hasOwnProperty.call(req.body, 'onlineExamUrl')
        ? String(req.body.onlineExamUrl ?? '').trim()
        : String(currentExam.onlineExamUrl ?? '').trim();
      updatePayload.googleFormUrl = nextGoogle;
      updatePayload.onlineExamUrl = nextOnline;
    }

    const exam = await Exam.findByIdAndUpdate(
      req.params.id,
      updatePayload,
      { new: true, runValidators: true }
    )
      .populate('subject', 'title code')
      .populate('class', 'className name classCode')
      .populate('teacherId', 'name email')
      .lean();

    res.json(createResponse(serializeExam(exam), 'Exam updated'));
  } catch (error) {
    next(error);
  }
});

router.get('/', authorize(readRoles), validate(paginationSchema), async (req, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    const search = String(req.query.search || '').trim();
    const filter: any = { ...listRecordFilter(req.user) };

    if (search) {
      filter.title = { $regex: search, $options: 'i' };
    }

    const role = req.user?.canonicalRole ?? req.user?.role;
    if (role === 'teacher') {
      filter.teacherId = req.user?.userId;
    }

    if (role === 'student') {
      const { classId, subjectId } = await resolveScopedStudentAssignment(String(req.user?.userId ?? ''));
      if (!classId || !subjectId) {
        filter._id = { $in: [] };
      } else {
        filter.class = classId;
        filter.subject = subjectId;
      }
    }

    if (role === 'parent' || role === 'family_student') {
      const currentUser = await User.findById(req.user?.userId).select('familyId parentProfileId').lean<any>();
      const students = await Student.find({
        isDeleted: false,
        ...(currentUser?.familyId ? { familyId: currentUser.familyId } : {}),
        ...(!currentUser?.familyId && currentUser?.parentProfileId ? { parentProfileId: currentUser.parentProfileId } : {})
      }).select('classId subjectId').lean<any[]>();
      const classIds = students.map((student) => student.classId).filter(Boolean);
      const subjectIds = students.map((student) => student.subjectId).filter(Boolean);
      filter.class = classIds.length ? { $in: classIds } : { $in: [] };
      filter.subject = subjectIds.length ? { $in: subjectIds } : { $in: [] };
    }

    const [exams, total] = await Promise.all([
      Exam.find(filter)
        .populate('subject', 'title code')
        .populate('class', 'className name classCode')
        .populate('teacherId', 'name email')
        .lean()
        .skip((page - 1) * limit)
        .limit(limit),
      Exam.countDocuments(filter)
    ]);

    res.json(createResponse(exams.map(serializeExam), '', { page, limit, total }));
  } catch (error) {
    next(error);
  }
});

router.get('/:id', authorize(readRoles), async (req, res, next) => {
  try {
    const exam: any = await Exam.findOne({ _id: req.params.id, isDeleted: false })
      .populate('subject', 'title code')
      .populate('class', 'className name classCode')
      .populate('teacherId', 'name email')
      .lean();

    if (!exam) return res.status(404).json(createError('Exam not found'));

    const role = req.user?.canonicalRole ?? req.user?.role;
    if (role === 'teacher' && !idsEqual(exam.teacherId?._id ?? exam.teacherId, req.user?.userId)) {
      return res.status(403).json(createError('Access denied'));
    }

    if (role === 'student') {
      const { classId, subjectId } = await resolveScopedStudentAssignment(String(req.user?.userId ?? ''));
      if (!idsEqual(exam.class?._id ?? exam.class, classId) || !idsEqual(exam.subject?._id ?? exam.subject, subjectId)) {
        return res.status(403).json(createError('Access denied'));
      }
    }

    if (role === 'parent' || role === 'family_student') {
      const currentUser = await User.findById(req.user?.userId).select('familyId parentProfileId').lean<any>();
      const students = await Student.find({
        isDeleted: false,
        ...(currentUser?.familyId ? { familyId: currentUser.familyId } : {}),
        ...(!currentUser?.familyId && currentUser?.parentProfileId ? { parentProfileId: currentUser.parentProfileId } : {})
      }).select('classId subjectId').lean<any[]>();
      const allow = students.some((student) => idsEqual(student.classId, exam.class?._id ?? exam.class) && idsEqual(student.subjectId, exam.subject?._id ?? exam.subject));
      if (!allow) {
        return res.status(403).json(createError('Access denied'));
      }
    }

    res.json(createResponse(serializeExam(exam)));
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', authorize(deleteRoles), async (req, res, next) => {
  try {
    const exam = await Exam.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false },
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: req.user?.userId ?? null
        }
      },
      { new: true }
    ).lean();

    if (!exam) {
      return res.status(404).json(createError('Exam not found'));
    }

    res.json(createResponse({}, 'Exam deleted successfully'));
  } catch (error) {
    next(error);
  }
});

export const examRouter = router;

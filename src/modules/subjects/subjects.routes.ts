import { Router } from 'express';
import Joi from 'joi';
import mongoose from 'mongoose';
import { ClassModel } from '../../models/Class';
import { Course } from '../../models/Course';
import { Exam } from '../../models/Exam';
import { Subject } from '../../models/Subject';
import { User } from '../../models/User';
import { Student } from '../../models/Student';
import { Timetable } from '../../models/Timetable';
import { resolveLocalizedText } from '../../utils/localizedText';
import { authenticate, authorize } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { createResponse, createError } from '../../helpers/response';
import { paginationSchema } from '../../validators/pagination';
import { isSuperAdminActor, listRecordFilter } from '../../utils/recordVisibility';

const router = Router();

const subjectCreateSchema = Joi.object({
  body: Joi.object({
    title: Joi.string().trim().required(),
    code: Joi.string().trim().required(),
    classId: Joi.string().hex().length(24).required(),
    classIds: Joi.array().items(Joi.string().hex().length(24)).optional(),
    feeAmount: Joi.number().min(0).default(0),
    teacher: Joi.string().hex().length(24).allow('', null).optional(),
    branchId: Joi.string().hex().length(24).allow('', null).optional(),
    description: Joi.string().allow('', null).optional(),
    activeStatus: Joi.boolean().optional()
  })
});

const subjectUpdateSchema = Joi.object({
  params: Joi.object({
    id: Joi.string().hex().length(24).required()
  }),
  body: Joi.object({
    title: Joi.string().trim().optional(),
    code: Joi.string().trim().optional(),
    classId: Joi.string().hex().length(24).optional(),
    classIds: Joi.array().items(Joi.string().hex().length(24)).optional(),
    feeAmount: Joi.number().min(0).optional(),
    teacher: Joi.string().hex().length(24).allow('', null).optional(),
    branchId: Joi.string().hex().length(24).allow('', null).optional(),
    description: Joi.string().allow('', null).optional(),
    activeStatus: Joi.boolean().optional()
  }).min(1)
});

const idParamsSchema = Joi.object({
  params: Joi.object({
    id: Joi.string().hex().length(24).required()
  })
});

const subjectQuerySchema = Joi.object({
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    search: Joi.string().allow('', null),
    classId: Joi.string().hex().length(24).optional(),
    includeDeleted: Joi.boolean().truthy('true').falsy('false').optional()
  })
});

router.use(authenticate);

function serializeSubject(subject: any, extras: Record<string, unknown> = {}) {
  const classRef = subject?.classId;
  const teacherRef = subject?.teacher;

  return {
    ...subject,
    classId: classRef?._id ?? classRef ?? null,
    className: classRef?.className ?? classRef?.name ?? '',
    teacher: teacherRef?._id ?? teacherRef ?? null,
    teacherId: teacherRef?._id ?? teacherRef ?? null,
    teacherName: teacherRef?.name ?? '',
    feeAmount: Number(subject?.feeAmount ?? 0),
    status: subject?.activeStatus === false ? 'inactive' : 'active',
    ...extras
  };
}

const scheduleDayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatScheduleSlot(entry: any) {
  const day = scheduleDayLabels[Number(entry?.dayOfWeek)] ?? '';
  const startTime = String(entry?.startTime ?? '').trim();
  const endTime = String(entry?.endTime ?? '').trim();
  const time = startTime && endTime
    ? `${startTime}-${endTime}`
    : startTime;
  const parts = [day, time].filter(Boolean);
  const room = String(entry?.room ?? '').trim();
  if (room) parts.push(room);
  return parts.join(' · ');
}

async function enrichSubjectListItems(subjects: any[], language = 'en') {
  if (!subjects.length) return subjects;

  const subjectIds = subjects
    .map((item) => item?._id)
    .filter((id) => mongoose.isValidObjectId(id));

  const classIdSet = new Set<string>();
  for (const subject of subjects) {
    const primaryClassId = subject?.classId?._id ?? subject?.classId;
    if (mongoose.isValidObjectId(primaryClassId)) {
      classIdSet.add(String(primaryClassId));
    }
    for (const classId of subject?.classIds ?? []) {
      const resolved = classId?._id ?? classId;
      if (mongoose.isValidObjectId(resolved)) {
        classIdSet.add(String(resolved));
      }
    }
  }

  const classIds = Array.from(classIdSet);

  const [courses, timetables, classes] = await Promise.all([
    subjectIds.length
      ? Course.find({ subjects: { $in: subjectIds }, isDeleted: false })
        .select('title subjects imageUrl')
        .lean()
      : Promise.resolve([]),
    subjectIds.length
      ? Timetable.find({ subjectId: { $in: subjectIds }, isDeleted: false })
        .select('subjectId dayOfWeek startTime endTime room')
        .sort({ dayOfWeek: 1, startTime: 1 })
        .lean()
      : Promise.resolve([]),
    classIds.length
      ? ClassModel.find({ _id: { $in: classIds }, isDeleted: false })
        .select('className name imageUrl thumbnailUrl')
        .lean()
      : Promise.resolve([])
  ]);

  const courseBySubject = new Map<string, any>();
  for (const course of courses) {
    for (const subjectId of course?.subjects ?? []) {
      const key = String(subjectId);
      if (!courseBySubject.has(key)) {
        courseBySubject.set(key, course);
      }
    }
  }

  const timetableBySubject = new Map<string, any>();
  for (const entry of timetables) {
    const key = String(entry?.subjectId);
    if (!timetableBySubject.has(key)) {
      timetableBySubject.set(key, entry);
    }
  }

  const classById = new Map(classes.map((item: any) => [String(item._id), item]));

  return subjects.map((subject) => {
    const subjectId = String(subject._id);
    const course = courseBySubject.get(subjectId);
    const timetable = timetableBySubject.get(subjectId);
    const primaryClass = classById.get(String(subject?.classId?._id ?? subject?.classId));
    const extraClassNames = (subject?.classIds ?? [])
      .map((classId: any) => classById.get(String(classId?._id ?? classId)))
      .filter(Boolean)
      .map((item: any) => item.className ?? item.name)
      .filter(Boolean);
    const classNames = Array.from(new Set([
      subject.className,
      ...extraClassNames
    ].filter(Boolean)));

    return serializeSubject(subject, {
      courseId: course?._id ?? null,
      courseName: course?.title ? resolveLocalizedText(course.title, language) : '',
      courseTitle: course?.title ?? null,
      imageUrl: primaryClass?.thumbnailUrl
        || primaryClass?.imageUrl
        || course?.imageUrl
        || '',
      classNames: classNames.join(', '),
      scheduleLabel: timetable ? formatScheduleSlot(timetable) : '',
      dayOfWeek: timetable?.dayOfWeek ?? null,
      startTime: timetable?.startTime ?? '',
      endTime: timetable?.endTime ?? '',
      room: timetable?.room ?? ''
    });
  });
}

async function validateSubjectRelations(classId: string, teacherId?: string | null) {
  const klass = await ClassModel.findOne({ _id: classId, isDeleted: false }).lean<any>();
  if (!klass) {
    throw new Error('Selected class is invalid');
  }

  let teacher: any = null;
  if (teacherId) {
    teacher = await User.findOne({ _id: teacherId, role: 'teacher', isDeleted: false }).lean<any>();
    if (!teacher) {
      throw new Error('Selected teacher is invalid');
    }
  }

  return { klass, teacher };
}

async function syncTeacherAssignments(subjectId: string, classId: string, nextTeacherId?: string | null, previousTeacherId?: string | null) {
  if (previousTeacherId && String(previousTeacherId) !== String(nextTeacherId)) {
    await User.updateOne(
      { _id: previousTeacherId, role: 'teacher' },
      { $pull: { assignedSubjects: subjectId } }
    );
  }

  if (nextTeacherId) {
    await User.updateOne(
      { _id: nextTeacherId, role: 'teacher' },
      { $addToSet: { assignedSubjects: subjectId, assignedClasses: classId } }
    );
  }
}

async function syncClassAssignments(subjectId: string, nextClassId: string, previousClassId?: string | null) {
  if (previousClassId && String(previousClassId) !== String(nextClassId)) {
    await ClassModel.updateOne(
      { _id: previousClassId },
      { $pull: { assignedSubjects: subjectId } }
    );
  }

  await ClassModel.updateOne(
    { _id: nextClassId },
    { $addToSet: { assignedSubjects: subjectId } }
  );
}

async function canAccessSubject(req: any, subject: any) {
  const role = req.user?.canonicalRole ?? req.user?.role;
  if (['super_admin', 'admin', 'branch_manager', 'owner'].includes(role)) {
    if (['admin', 'branch_manager'].includes(role) && req.user?.branchId && String(subject.branchId ?? '') !== String(req.user.branchId)) {
      return false;
    }
    return true;
  }
  if (role === 'teacher') {
    return String(subject.teacher?._id ?? subject.teacher ?? '') === String(req.user.userId);
  }
  if (role === 'student') {
    const currentUser = await User.findById(req.user.userId).select('studentId classId subjectId').lean<any>();
    const linkedStudent = currentUser?.studentId
      ? await Student.findOne({ studentId: currentUser.studentId, isDeleted: false }).select('classId subjectId').lean<any>()
      : null;
    const scopedClassId = linkedStudent?.classId ?? currentUser?.classId;
    const scopedSubjectId = linkedStudent?.subjectId ?? currentUser?.subjectId;
    return String(scopedClassId ?? '') === String(subject.classId?._id ?? subject.classId) && String(scopedSubjectId ?? '') === String(subject._id);
  }
  if (role === 'parent' || req.user?.role === 'family_student') {
    const currentUser = await User.findById(req.user.userId).select('familyId').lean<any>();
    const students = currentUser?.familyId
      ? await Student.find({ familyId: currentUser.familyId, isDeleted: false }).select('subjectId').lean<any[]>()
      : [];
    return students.some((student) => String(student.subjectId) === String(subject._id));
  }
  return false;
}

router.get('/', authorize(['super_admin', 'admin', 'branch_manager', 'teacher', 'student', 'family_student', 'parent', 'owner']), validate(subjectQuerySchema), async (req, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    const search = String(req.query.search || '').trim();
    const includeDeletedQuery = req.query.includeDeleted as unknown;
    const includeDeleted = isSuperAdminActor(req.user) || includeDeletedQuery === true || includeDeletedQuery === 'true';
    const role = req.user?.canonicalRole ?? req.user?.role;
    const filter: any = listRecordFilter(req.user, includeDeleted);

    if ((role === 'admin' || role === 'branch_manager') && req.user?.branchId) {
      filter.branchId = req.user.branchId;
    }

    if (search) filter.title = { $regex: search, $options: 'i' };
    if (req.query.classId) {
      filter.$or = [
        { classId: req.query.classId },
        { classIds: req.query.classId }
      ];
    }
    if (role === 'teacher') {
      filter.teacher = req.user?.userId;
    }

    if (role === 'student') {
      const currentUser = await User.findById(req.user?.userId).select('studentId classId subjectId').lean<any>();
      const linkedStudent = currentUser?.studentId
        ? await Student.findOne({ studentId: currentUser.studentId, isDeleted: false }).select('classId subjectId').lean<any>()
        : null;
      const classId = linkedStudent?.classId ?? currentUser?.classId;
      const subjectId = linkedStudent?.subjectId ?? currentUser?.subjectId;
      if (classId && subjectId) {
        filter.$and = [
          {
            $or: [
              { classId },
              { classIds: classId }
            ]
          },
          { _id: subjectId }
        ];
      } else {
        filter._id = { $in: [] };
      }
    }

    if (role === 'parent' || req.user?.role === 'family_student') {
      const currentUser = await User.findById(req.user?.userId).select('familyId parentProfileId').lean<any>();
      const students = await Student.find({
        isDeleted: false,
        ...(currentUser?.familyId ? { familyId: currentUser.familyId } : {}),
        ...(!currentUser?.familyId && currentUser?.parentProfileId ? { parentProfileId: currentUser.parentProfileId } : {})
      }).select('subjectId').lean<any[]>();
      const subjectIds = students.map((student) => student.subjectId).filter(Boolean);
      filter._id = subjectIds.length ? { $in: subjectIds } : { $in: [] };
    }

    const [subjects, total] = await Promise.all([
      Subject.find(filter)
        .populate('teacher', 'name email')
        .populate('classId', 'className name classCode imageUrl thumbnailUrl')
        .lean()
        .skip((page - 1) * limit)
        .limit(limit),
      Subject.countDocuments(filter)
    ]);

    const language = String(req.query.lang || 'en');
    const enrichedSubjects = await enrichSubjectListItems(subjects, language);

    res.json(createResponse(enrichedSubjects, '', { page, limit, total }));
  } catch (error) {
    next(error);
  }
});

router.post('/', authorize(['super_admin', 'admin', 'branch_manager']), validate(subjectCreateSchema), async (req, res, next) => {
  try {
    const { klass, teacher } = await validateSubjectRelations(req.body.classId, req.body.teacher || null);

    const duplicate = await Subject.findOne({
      $or: [
        { code: req.body.code.trim() },
        { title: req.body.title.trim(), classId: req.body.classId, isDeleted: false }
      ]
    }).lean();

    if (duplicate) {
      return res.status(409).json(createError('Subject already exists'));
    }

    const subject = await Subject.create({
      ...req.body,
      branchId: req.body.branchId ?? klass.branchId ?? teacher?.branchId ?? null,
      title: req.body.title.trim(),
      code: req.body.code.trim(),
      description: req.body.description ?? '',
      teacher: req.body.teacher || null,
      classIds: Array.from(new Set([req.body.classId, ...(req.body.classIds ?? [])].map(String))),
      activeStatus: req.body.activeStatus ?? true
    });

    await Promise.all([
      syncTeacherAssignments(String(subject._id), String(req.body.classId), req.body.teacher || null),
      syncClassAssignments(String(subject._id), String(req.body.classId))
    ]);

    const savedSubject = await Subject.findById(subject._id)
      .populate('teacher', 'name email')
      .populate('classId', 'className name classCode')
      .lean();

    res.status(201).json(createResponse(serializeSubject(savedSubject), 'Subject created successfully'));
  } catch (error: any) {
    if (/invalid/i.test(String(error?.message || ''))) {
      return res.status(400).json(createError(String(error.message)));
    }
    next(error);
  }
});

router.get('/:id/details', authorize(['super_admin', 'admin', 'branch_manager', 'teacher', 'student', 'family_student', 'parent', 'owner']), validate(idParamsSchema), async (req, res, next) => {
  try {
    const subject = await Subject.findOne({ _id: req.params.id, isDeleted: false })
      .populate('teacher', 'name email phone whatsapp')
      .populate('classId', 'className name classCode feeAmount weeklySchedule')
      .lean<any>();

    if (!subject) return res.status(404).json(createError('Subject not found'));
    if (!(await canAccessSubject(req, subject))) return res.status(403).json(createError('Access denied'));

    const [students, timetable] = await Promise.all([
      Student.find({ subjectId: subject._id, isDeleted: false }).select('firstName lastName studentId status accountStatus').limit(100).lean(),
      Timetable.find({ subjectId: subject._id, isDeleted: false }).populate('teacherId', 'name email').sort({ dayOfWeek: 1, startTime: 1 }).lean()
    ]);

    res.json(createResponse({
      ...serializeSubject(subject),
      relatedClass: subject.classId,
      teachers: subject.teacher ? [subject.teacher] : [],
      students,
      studentCount: students.length,
      timetable,
      attendanceRules: {
        source: 'timetable',
        message: 'Attendance is available only during active timetable time.'
      },
      status: subject.activeStatus ? 'active' : 'inactive'
    }));
  } catch (error) {
    next(error);
  }
});

router.get('/:id', authorize(['super_admin', 'admin', 'branch_manager', 'teacher', 'student', 'family_student', 'parent', 'owner']), validate(idParamsSchema), async (req, res, next) => {
  try {
    const subject = await Subject.findOne({ _id: req.params.id, isDeleted: false })
      .populate('teacher', 'name email')
      .populate('classId', 'className name classCode')
      .lean();

    if (!subject) return res.status(404).json(createError('Subject not found'));
    if (!(await canAccessSubject(req, subject))) return res.status(403).json(createError('Access denied'));
    res.json(createResponse(serializeSubject(subject)));
  } catch (error) {
    next(error);
  }
});

const updateSubjectHandler = async (req: any, res: any, next: any) => {
  try {
    const existingSubject = await Subject.findOne({ _id: req.params.id, isDeleted: false }).lean<any>();
    if (!existingSubject) {
      return res.status(404).json(createError('Subject not found'));
    }

    const nextClassId = req.body.classId ?? String(existingSubject.classId);
    const nextTeacherId = req.body.teacher === '' ? null : (req.body.teacher ?? (existingSubject.teacher ? String(existingSubject.teacher) : null));
    const nextCode = req.body.code ? String(req.body.code).trim() : existingSubject.code;
    const nextTitle = req.body.title ? String(req.body.title).trim() : existingSubject.title;

    await validateSubjectRelations(nextClassId, nextTeacherId);

    const duplicate = await Subject.findOne({
      _id: { $ne: req.params.id },
      isDeleted: false,
      $or: [
        { code: nextCode },
        { title: nextTitle, classId: nextClassId }
      ]
    }).lean();

    if (duplicate) {
      return res.status(409).json(createError('Subject already exists'));
    }

    const subject = await Subject.findByIdAndUpdate(
      req.params.id,
      {
        ...req.body,
        title: nextTitle,
        code: nextCode,
        classId: nextClassId,
        classIds: Array.from(new Set([nextClassId, ...(req.body.classIds ?? existingSubject.classIds ?? [])].map(String))),
        teacher: nextTeacherId,
        description: req.body.description ?? existingSubject.description ?? '',
        branchId: req.body.branchId ?? existingSubject.branchId ?? null
      },
      { new: true, runValidators: true }
    )
      .populate('teacher', 'name email')
      .populate('classId', 'className name classCode')
      .lean();

    await Promise.all([
      syncTeacherAssignments(String(req.params.id), String(nextClassId), nextTeacherId, existingSubject.teacher ? String(existingSubject.teacher) : null),
      syncClassAssignments(String(req.params.id), String(nextClassId), existingSubject.classId ? String(existingSubject.classId) : null)
    ]);

    res.json(createResponse(serializeSubject(subject), 'Subject updated successfully'));
  } catch (error) {
    next(error);
  }
};

router.put('/:id', authorize(['super_admin', 'admin', 'branch_manager']), validate(subjectUpdateSchema), updateSubjectHandler);
router.patch('/:id', authorize(['super_admin', 'admin', 'branch_manager']), validate(subjectUpdateSchema), updateSubjectHandler);

router.patch('/:id/restore', authorize(['super_admin']), validate(idParamsSchema), async (req, res, next) => {
  try {
    const subject = await Subject.findOneAndUpdate(
      { _id: req.params.id },
      { isDeleted: false, deletedAt: null, deletedBy: null },
      { new: true }
    ).lean<any>();

    if (!subject) {
      return res.status(404).json(createError('Subject not found'));
    }

    res.json(createResponse(serializeSubject(subject), 'Subject restored successfully'));
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', authorize(['super_admin', 'admin']), validate(idParamsSchema), async (req, res, next) => {
  try {
    const [studentCount, examCount, subject] = await Promise.all([
      Student.countDocuments({ subjectId: req.params.id, isDeleted: false }),
      Exam.countDocuments({ subject: req.params.id, isDeleted: false }),
      Subject.findOne({ _id: req.params.id, isDeleted: false }).lean<any>()
    ]);

    if (!subject) {
      return res.status(404).json(createError('Subject not found'));
    }

    if (studentCount > 0 || examCount > 0) {
      return res.status(400).json(createError('Cannot delete a subject that is linked to students or exams'));
    }

    const deletedAt = new Date();
    await Promise.all([
      Subject.updateOne(
        { _id: req.params.id },
        {
          $set: {
            isDeleted: true,
            deletedAt,
            deletedBy: req.user?.userId ?? null,
            activeStatus: false
          }
        }
      ),
      User.updateOne(
        { _id: subject.teacher, role: 'teacher' },
        { $pull: { assignedSubjects: req.params.id } }
      ),
      ClassModel.updateOne(
        { _id: subject.classId },
        { $pull: { assignedSubjects: req.params.id } }
      )
    ]);

    res.json(createResponse({}, 'Subject deleted successfully'));
  } catch (error) {
    next(error);
  }
});

export const subjectRouter = router;

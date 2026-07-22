import { Router } from 'express';
import { Request } from 'express';
import Joi from 'joi';
import mongoose from 'mongoose';
import { StudentService } from '../../services/studentService';
import { resolveHttpStatus } from '../../utils/httpErrors';
import { Student } from '../../models/Student';
import { User } from '../../models/User';
import { authenticate, authorize } from '../../middlewares/auth';
import { requireAdmin, requireFamily, requireTeacher } from '../../middlewares/rbac';
import { validate } from '../../middlewares/validate';
import { createResponse, createError } from '../../helpers/response';
import { paginationSchema } from '../../validators/pagination';
import { resolveStudentContext } from '../../utils/studentScope';
import { Timetable } from '../../models/Timetable';
import { Payment } from '../../models/Payment';
import { Result } from '../../models/Result';
import { Attendance } from '../../models/Attendance';
import { Subject } from '../../models/Subject';
import { ClassModel } from '../../models/Class';
import { Enrollment } from '../../models/Enrollment';
import { restoreSoftDeletedRecord } from '../../utils/softDeleteRestore';
import { enrichStudentWithDisplay, enrichStudentsWithDisplay, studentPopulatePaths } from '../../utils/studentDisplay';
import { afghanPhoneField, personNameField } from '../../validators/fieldSchemas';

const router = Router();
const studentService = new StudentService();

async function teacherCanAccessStudentRecord(teacherId: string, studentDocId: string) {
  const student = await Student.findOne({
    _id: studentDocId,
    isDeleted: false,
    status: { $ne: 'inactive' }
  })
    .select('_id teacherId classId status')
    .lean<Record<string, unknown>>();
  if (!student) return false;
  if (String(student.teacherId) === String(teacherId)) return true;

  const [enrollment, classDoc, timetableEntry] = await Promise.all([
    Enrollment.findOne({
      studentId: studentDocId,
      teacherId,
      status: 'active',
      isDeleted: { $ne: true }
    }).select('_id').lean(),
    ClassModel.findOne({
      _id: student.classId,
      isDeleted: false,
      $or: [{ teacherId }, { assignedTeachers: teacherId }]
    }).select('_id').lean(),
    Timetable.findOne({
      classId: student.classId,
      teacherId,
      isDeleted: { $ne: true }
    }).select('_id').lean()
  ]);

  return Boolean(enrollment || classDoc || timetableEntry);
}

function serializeStudent(student: any) {
  const classRef = student?.classId;
  const subjectRef = student?.subjectId;
  const teacherRef = student?.teacherId;

  return {
    ...student,
    classId: classRef?._id ?? classRef ?? null,
    subjectId: subjectRef?._id ?? subjectRef ?? null,
    teacherId: teacherRef?._id ?? teacherRef ?? null,
    className: classRef?.name ?? classRef?.className ?? '',
    subjectName: subjectRef?.title ?? '',
    teacherName: teacherRef?.name ?? '',
    classCode: classRef?.classCode ?? '',
    studentDisplay: student?.studentDisplay ?? {
      studentNumber: student?.studentNumber ?? student?.rollNo ?? student?.studentId ?? '',
      fullName: student?.fullName ?? [student?.firstName, student?.lastName].filter(Boolean).join(' '),
      className: classRef?.name ?? classRef?.className ?? student?.className ?? '',
      subjectName: subjectRef?.title ?? student?.subjectName ?? '',
      teacherName: teacherRef?.name ?? student?.teacherName ?? '',
      guardianPhone: student?.guardianPhone ?? student?.familyPhone ?? '',
      studentPhone: student?.studentPhone ?? student?.phone ?? student?.whatsapp ?? '',
      branchName: student?.branchName ?? '',
      enrollmentStatus: student?.enrollmentStatus ?? student?.status ?? student?.accountStatus ?? ''
    }
  };
}

const registerStudentSchema = Joi.object({
  body: Joi.object({
    firstName: personNameField(true),
    lastName: personNameField(true),
    fatherName: personNameField(true),
    nationalId: Joi.string().trim().max(80).allow('', null).optional(),
    familyPhone: afghanPhoneField(false),
    phone: afghanPhoneField(false),
    whatsapp: afghanPhoneField(false),
    loginEmail: Joi.string().email().allow('', null).optional(),
    loginPassword: Joi.string().min(8).max(64).allow('', null).optional(),
    profileImage: Joi.string().allow('', null).optional(),
    gender: Joi.string().valid('male', 'female', 'other').required(),
    branchId: Joi.string().hex().length(24).optional(),
    classId: Joi.string().hex().length(24).required(),
    subjectId: Joi.string().hex().length(24).required(),
    teacherId: Joi.string().hex().length(24).required(),
    feeAmount: Joi.number().min(0).optional(),
    paidAmount: Joi.number().min(0).optional(),
    registrationStartDate: Joi.date().optional(),
    registrationEndDate: Joi.date().optional(),
    registrationExpiryDate: Joi.date().optional()
  })
});

const updateStudentSchema = Joi.object({
  body: Joi.object({
    firstName: personNameField(false),
    lastName: personNameField(false),
    fatherName: personNameField(false),
    nationalId: Joi.string().trim().max(80).allow('', null).optional(),
    familyPhone: afghanPhoneField(false),
    phone: afghanPhoneField(false),
    whatsapp: afghanPhoneField(false),
    loginEmail: Joi.string().email().allow('', null).optional(),
    loginPassword: Joi.string().min(8).max(64).allow('', null).optional(),
    profileImage: Joi.string().allow('', null).optional(),
    gender: Joi.string().valid('male', 'female', 'other').optional(),
    branchId: Joi.string().hex().length(24).optional(),
    classId: Joi.string().hex().length(24).optional(),
    subjectId: Joi.string().hex().length(24).optional(),
    teacherId: Joi.string().hex().length(24).optional(),
    feeAmount: Joi.number().min(0).optional(),
    paidAmount: Joi.number().min(0).optional(),
    registrationStartDate: Joi.date().optional(),
    registrationEndDate: Joi.date().optional(),
    registrationExpiryDate: Joi.date().allow(null).optional(),
    accountStatus: Joi.string().valid('active', 'warning', 'expired', 'blocked').optional(),
    status: Joi.string().valid('active', 'inactive', 'suspended', 'graduated').optional()
  }).min(1)
});

const updateStudentWithIdSchema = Joi.object({
  params: Joi.object({
    id: Joi.string().hex().length(24).required()
  }),
  body: Joi.object({
    firstName: personNameField(false),
    lastName: personNameField(false),
    fatherName: personNameField(false),
    nationalId: Joi.string().trim().max(80).allow('', null).optional(),
    familyPhone: afghanPhoneField(false),
    phone: afghanPhoneField(false),
    whatsapp: afghanPhoneField(false),
    loginEmail: Joi.string().email().allow('', null).optional(),
    loginPassword: Joi.string().min(8).max(64).allow('', null).optional(),
    profileImage: Joi.string().allow('', null).optional(),
    gender: Joi.string().valid('male', 'female', 'other').optional(),
    branchId: Joi.string().hex().length(24).optional(),
    classId: Joi.string().hex().length(24).optional(),
    subjectId: Joi.string().hex().length(24).optional(),
    teacherId: Joi.string().hex().length(24).optional(),
    feeAmount: Joi.number().min(0).optional(),
    paidAmount: Joi.number().min(0).optional(),
    registrationStartDate: Joi.date().optional(),
    registrationEndDate: Joi.date().optional(),
    registrationExpiryDate: Joi.date().allow(null).optional(),
    accountStatus: Joi.string().valid('active', 'warning', 'expired', 'blocked').optional(),
    status: Joi.string().valid('active', 'inactive', 'suspended', 'graduated').optional()
  }).min(1)
});

const studentListQuerySchema = Joi.object({
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(200).default(20),
    search: Joi.string().allow('', null).optional(),
    classId: Joi.string().hex().length(24).allow('', null).optional(),
    branchId: Joi.string().hex().length(24).allow('', null).optional(),
    status: Joi.string().allow('', null).optional(),
    includeDeleted: Joi.boolean().truthy('true').falsy('false').optional()
  })
});

const renewRegistrationSchema = Joi.object({
  params: Joi.object({ id: Joi.string().hex().length(24).required() }),
  body: Joi.object({
    registrationStartDate: Joi.date().required(),
    registrationEndDate: Joi.date().required(),
    feeAmount: Joi.number().min(0).optional(),
    paidAmount: Joi.number().min(0).optional()
  })
});

const idParamsSchema = Joi.object({
  params: Joi.object({
    id: Joi.string().hex().length(24).required()
  })
});

router.use(authenticate);

function respondWithRouteError(res: any, error: unknown, fallbackMessage: string) {
  const status = resolveHttpStatus(error);
  const message = error instanceof Error ? error.message : fallbackMessage;
  if (status >= 500) {
    console.error(fallbackMessage, error);
  }
  return res.status(status).json(createError(message || fallbackMessage));
}

// Register student - admin only
router.post('/', requireAdmin, validate(registerStudentSchema), async (req: Request, res) => {
  try {
    const classId = req.body.classId || req.body.class;
    const subjectId = req.body.subjectId || req.body.subject;
    const teacherId = req.body.teacherId || req.body.teacher;

    if (!classId || !subjectId || !teacherId) {
      return res.status(400).json(createError('Missing required fields: classId, subjectId, or teacherId'));
    }

    const count = await Student.countDocuments();
    req.body.rollNo = `STD-${count + 1}`;

    const student = await studentService.registerStudent({
      ...req.body,
      classId,
      subjectId,
      teacherId,
      createdBy: req.user?.userId ?? null
    });
    res.status(201).json(createResponse(await enrichStudentWithDisplay(student.toObject ? student.toObject() : student), 'Student registered successfully'));
  } catch (error: any) {
    if (error instanceof mongoose.Error.ValidationError) {
      return res.status(400).json(createError(error.message));
    }
    return respondWithRouteError(res, error, 'Failed to register student');
  }
});

router.put('/:id', requireAdmin, validate(updateStudentWithIdSchema), async (req: Request, res) => {
  try {
    const updatedStudent = await studentService.updateStudent(req.params.id, { ...req.body, updatedBy: req.user?.userId ?? null });
    if (!updatedStudent) {
      return res.status(404).json(createError('Student not found'));
    }
    res.json(createResponse(await enrichStudentWithDisplay(updatedStudent.toObject ? updatedStudent.toObject() : updatedStudent), 'Student updated successfully'));
  } catch (error: any) {
    if (error instanceof mongoose.Error.ValidationError) {
      return res.status(400).json(createError(error.message));
    }
    return respondWithRouteError(res, error, 'Failed to update student');
  }
});

router.post('/:id/renew-registration', requireAdmin, validate(renewRegistrationSchema), async (req: Request, res) => {
  try {
    const student = await studentService.renewRegistration(req.params.id, { ...req.body, actorId: req.user?.userId ?? null });
    if (!student) return res.status(404).json(createError('Student not found'));
    res.json(createResponse(student, 'Student registration renewed successfully'));
  } catch (error: any) {
    res.status(400).json(createError(String(error?.message || 'Failed to renew registration')));
  }
});

router.post('/:id/block', requireAdmin, validate(idParamsSchema), async (req: Request, res) => {
  try {
    const student = await studentService.setBlockStatus(req.params.id, true, req.user?.userId ?? null);
    if (!student) return res.status(404).json(createError('Student not found'));
    res.json(createResponse(student, 'Student account blocked successfully'));
  } catch (error: any) {
    res.status(400).json(createError(String(error?.message || 'Failed to block student')));
  }
});

router.post('/:id/unblock', requireAdmin, validate(idParamsSchema), async (req: Request, res) => {
  try {
    const student = await studentService.setBlockStatus(req.params.id, false, req.user?.userId ?? null);
    if (!student) return res.status(404).json(createError('Student not found'));
    res.json(createResponse(student, 'Student account unblocked successfully'));
  } catch (error: any) {
    res.status(400).json(createError(String(error?.message || 'Failed to unblock student')));
  }
});

router.get('/', requireTeacher, validate(studentListQuerySchema), async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    const search = String(req.query.search || '').trim();
    const includeDeletedQuery = req.query.includeDeleted as unknown;
    const includeDeleted =
      req.user?.canonicalRole === 'super_admin' &&
      (includeDeletedQuery === true || includeDeletedQuery === 'true');
    const filter: any = includeDeleted ? {} : { isDeleted: false };
    const andClauses: any[] = [];

    if (search) {
      andClauses.push({
        $or: [
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } },
          { fatherName: { $regex: search, $options: 'i' } },
          { studentId: { $regex: search, $options: 'i' } },
          { familyPhone: { $regex: search, $options: 'i' } },
          { whatsapp: { $regex: search, $options: 'i' } },
          { loginEmail: { $regex: search, $options: 'i' } },
          { familyEmail: { $regex: search, $options: 'i' } }
        ]
      });
    }

    if (req.user?.canonicalRole === 'teacher') {
      const teacherId = req.user.userId;
      const [enrollmentStudentIds, teacherClassIds] = await Promise.all([
        Enrollment.distinct('studentId', {
          teacherId,
          status: 'active',
          isDeleted: { $ne: true }
        }),
        ClassModel.distinct('_id', {
          isDeleted: false,
          $or: [{ teacherId }, { assignedTeachers: teacherId }]
        })
      ]);
      const classStudentIds = teacherClassIds.length
        ? await Student.distinct('_id', {
          classId: { $in: teacherClassIds },
          status: 'active',
          isDeleted: false
        })
        : [];
      const relatedStudentIds = [
        ...new Set([
          ...enrollmentStudentIds.map(String),
          ...classStudentIds.map(String)
        ])
      ];
      andClauses.push({
        $or: [
          { teacherId },
          ...(relatedStudentIds.length ? [{ _id: { $in: relatedStudentIds } }] : [])
        ]
      });
    }

    if (andClauses.length) {
      filter.$and = andClauses;
    }

    if (req.query.branchId && ['super_admin', 'admin', 'branch_manager', 'owner'].includes(String(req.user?.canonicalRole))) {
      filter.branchId = req.query.branchId;
    }

    if (req.query.classId) {
      filter.classId = req.query.classId;
    }

    if (req.query.status) {
      filter.status = req.query.status;
    }

    if (req.user?.canonicalRole === 'student') {
      const context = await resolveStudentContext(req);
      filter._id = context?.studentDocId ?? { $in: [] };
    }

    if (req.user?.canonicalRole === 'parent' || req.user?.role === 'family_student') {
      const currentUser = await User.findById(req.user?.userId).select('familyId parentProfileId').lean<Record<string, any>>();
      const familyStudents = await Student.find({
        isDeleted: false,
        ...(currentUser?.familyId ? { familyId: currentUser.familyId } : {}),
        ...(!currentUser?.familyId && currentUser?.parentProfileId ? { parentProfileId: currentUser.parentProfileId } : {})
      }).select('_id').lean();
      filter._id = { $in: familyStudents.map((student) => student._id) };
    }

    const [students, total] = await Promise.all([
      studentPopulatePaths.reduce((query: any, populate) => query.populate(populate), Student.find(filter))
        .lean()
        .skip((page - 1) * limit)
        .limit(limit),
      Student.countDocuments(filter)
    ]);

    const normalizedStudents = await enrichStudentsWithDisplay(students);
    res.json(createResponse(normalizedStudents.map(serializeStudent), '', { page, limit, total }));
  } catch (error: any) {
    res.status(500).json(createError(String(error?.message || 'Failed to fetch students')));
  }
});

router.patch('/:id/restore', authorize(['super_admin']), validate(idParamsSchema), async (req, res) => {
  try {
    const restored = await restoreSoftDeletedRecord(Student, req.params.id);
    if (!restored) {
      return res.status(404).json(createError('Student not found'));
    }
    res.json(createResponse(restored, 'Student restored successfully'));
  } catch (error: any) {
    res.status(500).json(createError(String(error?.message || 'Failed to restore student')));
  }
});

router.delete('/:id', requireAdmin, validate(idParamsSchema), async (req, res) => {
  try {
    const deletedStudent = await studentService.deleteStudent(req.params.id, req.user?.userId ?? null);
    if (!deletedStudent) {
      return res.status(404).json(createError('Student not found'));
    }

    res.json(createResponse({}, 'Student deleted successfully'));
  } catch (error: any) {
    res.status(500).json(createError(String(error?.message || 'Failed to delete student')));
  }
});

// Get students by family - family only
router.get('/family', requireFamily, async (req, res) => {
  try {
    const currentUser = await User.findById(req.user?.userId).lean<Record<string, any>>();
    const familyId = currentUser?.familyId;
    if (!familyId) {
      return res.json(createResponse([]));
    }
    const students = await studentService.getStudentsByFamily(familyId);
    const normalizedStudents = await enrichStudentsWithDisplay(students.map((student) => student.toObject()));
    res.json(createResponse(normalizedStudents));
  } catch (error) {
    res.status(500).json(createError('Failed to fetch students'));
  }
});

// Get students by teacher - teacher only
router.get('/me/dashboard', async (req, res) => {
  try {
    if (req.user?.canonicalRole !== 'student') {
      return res.status(403).json(createError('Forbidden'));
    }
    const context = await resolveStudentContext(req);
    if (!context?.student && !context?.user) {
      return res.status(404).json(createError('Student profile not found'));
    }

    const studentDocId = context.studentDocId;
    const userId = req.user?.userId;
    const [payments, results, attendanceCount] = await Promise.all([
      studentDocId
        ? Payment.find({ studentId: studentDocId, isDeleted: false }).sort({ createdAt: -1 }).limit(5).lean()
        : [],
      Result.find({ student: userId, isDeleted: false }).sort({ createdAt: -1 }).limit(5).lean(),
      Attendance.countDocuments({ userId, isDeleted: false })
    ]);

    res.json(createResponse({
      profile: {
        name: context.user.name,
        email: context.user.email,
        phone: context.user.phone,
        studentId: context.student?.studentId ?? context.user.studentId,
        class: context.student?.classId ?? null,
        subject: context.student?.subjectId ?? null,
        teacher: context.student?.teacherId ?? null,
        feeAmount: context.student?.feeAmount ?? context.user.feeAmount,
        remainingBalance: context.student?.remainingBalance ?? context.user.remainingBalance
      },
      payments,
      results,
      attendanceCount
    }));
  } catch (error: any) {
    res.status(500).json(createError(String(error?.message || 'Failed to load student dashboard')));
  }
});

router.get('/me/profile', async (req, res) => {
  try {
    if (req.user?.canonicalRole !== 'student') {
      return res.status(403).json(createError('Forbidden'));
    }
    const context = await resolveStudentContext(req);
    if (!context) return res.status(404).json(createError('Student profile not found'));
    res.json(createResponse({
      user: context.user,
      student: context.student ? await enrichStudentWithDisplay(serializeStudent(context.student)) : null
    }));
  } catch (error: any) {
    res.status(500).json(createError(String(error?.message || 'Failed to load profile')));
  }
});

router.get('/me/classes', async (req, res) => {
  try {
    if (req.user?.canonicalRole !== 'student') {
      return res.status(403).json(createError('Forbidden'));
    }
    const context = await resolveStudentContext(req);
    if (!context?.classId) return res.json(createResponse([]));
    const klass = await ClassModel.findOne({ _id: context.classId, isDeleted: false })
      .populate('assignedTeachers', 'name email')
      .populate('assignedSubjects', 'title code')
      .lean();
    res.json(createResponse(klass ? [klass] : []));
  } catch (error: any) {
    res.status(500).json(createError(String(error?.message || 'Failed to load classes')));
  }
});

router.get('/me/subjects', async (req, res) => {
  try {
    if (req.user?.canonicalRole !== 'student') {
      return res.status(403).json(createError('Forbidden'));
    }
    const context = await resolveStudentContext(req);
    if (!context?.subjectId) return res.json(createResponse([]));
    const subject = await Subject.findOne({ _id: context.subjectId, isDeleted: false }).lean();
    res.json(createResponse(subject ? [subject] : []));
  } catch (error: any) {
    res.status(500).json(createError(String(error?.message || 'Failed to load subjects')));
  }
});

router.get('/me/teachers', async (req, res) => {
  try {
    if (req.user?.canonicalRole !== 'student') {
      return res.status(403).json(createError('Forbidden'));
    }
    const context = await resolveStudentContext(req);
    if (!context?.teacherId) return res.json(createResponse([]));
    const teacher = await User.findOne({ _id: context.teacherId, role: 'teacher', isDeleted: false })
      .select('name email phone whatsapp')
      .lean();
    res.json(createResponse(teacher ? [teacher] : []));
  } catch (error: any) {
    res.status(500).json(createError(String(error?.message || 'Failed to load teachers')));
  }
});

router.get('/me/timetable', async (req, res) => {
  try {
    if (req.user?.canonicalRole !== 'student') {
      return res.status(403).json(createError('Forbidden'));
    }
    const context = await resolveStudentContext(req);
    if (!context?.classId) return res.json(createResponse([]));
    const items = await Timetable.find({ classId: context.classId, isDeleted: false })
      .populate('subjectId', 'title code')
      .populate('teacherId', 'name email')
      .sort({ dayOfWeek: 1, startTime: 1 })
      .lean();
    res.json(createResponse(items));
  } catch (error: any) {
    res.status(500).json(createError(String(error?.message || 'Failed to load timetable')));
  }
});

router.get('/me/payments', async (req, res) => {
  try {
    if (req.user?.canonicalRole !== 'student') {
      return res.status(403).json(createError('Forbidden'));
    }
    const context = await resolveStudentContext(req);
    if (!context?.studentDocId) return res.json(createResponse([]));
    const payments = await Payment.find({ studentId: context.studentDocId, isDeleted: false })
      .sort({ createdAt: -1 })
      .lean();
    res.json(createResponse(payments));
  } catch (error: any) {
    res.status(500).json(createError(String(error?.message || 'Failed to load payments')));
  }
});

router.get('/teacher', requireTeacher, async (req, res) => {
  try {
    const teacherId = req.user?.userId;
    if (!teacherId) {
      return res.status(401).json(createError('Authentication required'));
    }
    const students = await studentService.getStudentsByTeacher(teacherId);
    const normalizedStudents = await enrichStudentsWithDisplay(students.map((student) => student.toObject()));
    res.json(createResponse(normalizedStudents));
  } catch (error) {
    res.status(500).json(createError('Failed to fetch students'));
  }
});

router.get('/:id', requireTeacher, validate(idParamsSchema), async (req, res) => {
  try {
    const filter: Record<string, unknown> = {
      _id: req.params.id,
      isDeleted: false
    };

    if (req.user?.canonicalRole === 'teacher') {
      const allowed = await teacherCanAccessStudentRecord(
        String(req.user.userId),
        String(req.params.id)
      );
      if (!allowed) {
        return res.status(404).json(createError('Student not found'));
      }
    } else if (req.user?.canonicalRole === 'student') {
      const context = await resolveStudentContext(req);
      if (String(context?.studentDocId ?? '') !== String(req.params.id)) {
        return res.status(404).json(createError('Student not found'));
      }
    }

    const student = await studentPopulatePaths.reduce((query: any, populate) => query.populate(populate), Student.findOne(filter))
      .lean();

    if (!student) {
      return res.status(404).json(createError('Student not found'));
    }

    res.json(createResponse(serializeStudent(await enrichStudentWithDisplay(student))));
  } catch (error: any) {
    res.status(500).json(createError(String(error?.message || 'Failed to fetch student')));
  }
});

export const studentRouter = router;

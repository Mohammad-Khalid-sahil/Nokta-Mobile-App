import { Router } from 'express';
import Joi from 'joi';
import { authenticate, authorize } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { createError, createResponse } from '../../helpers/response';
import { generalLimiter, authLimiter } from '../../middlewares/rateLimiter';
import { AIClassExamInsight } from '../../models/AIClassExamInsight';
import { AIResultInsight } from '../../models/AIResultInsight';
import { Exam } from '../../models/Exam';
import { Result } from '../../models/Result';
import { Student } from '../../models/Student';
import { User } from '../../models/User';
import { AuditService } from '../../services/auditService';
import { canAccessStudentInsight, isPrivilegedRole } from './ai-results.access';
import { generateExamInsights, getStoredOrCreateAIResultInsight, upsertAIResultInsight } from './aiResultAnalysis.service';

const router = Router();
const auditService = new AuditService();

const studentParamsSchema = Joi.object({
  params: Joi.object({ studentId: Joi.string().hex().length(24).required() })
});

const examParamsSchema = Joi.object({
  params: Joi.object({ examId: Joi.string().hex().length(24).required() })
});

const classParamsSchema = Joi.object({
  params: Joi.object({ classId: Joi.string().hex().length(24).required() })
});

const resultParamsSchema = Joi.object({
  params: Joi.object({ resultId: Joi.string().hex().length(24).required() })
});

async function assertStudentAccess(req: any, studentId: string) {
  const role = String(req.user?.canonicalRole ?? req.user?.role ?? '');
  if (isPrivilegedRole(role)) return true;

  const studentUser = await User.findById(studentId).select('assignedTeacherId branchId studentId').lean<any>();
  let familyLinked = false;

  if (role === 'parent' || role === 'family_student') {
    const familyUser = await User.findById(req.user.userId).select('familyId parentProfileId').lean<any>();
    const studentRecord = await Student.findOne({ studentId: studentUser?.studentId, isDeleted: false }).select('familyId parentProfileId').lean<any>();
    const linkedByFamily = familyUser?.familyId && studentRecord?.familyId && String(studentRecord.familyId) === String(familyUser.familyId);
    const linkedByParent = !familyUser?.familyId && familyUser?.parentProfileId && studentRecord?.parentProfileId && String(studentRecord.parentProfileId) === String(familyUser.parentProfileId);
    familyLinked = Boolean(linkedByFamily || linkedByParent);
  }

  return canAccessStudentInsight({
    role,
    requestUserId: String(req.user?.userId ?? ''),
    studentId: String(studentId),
    requestBranchId: req.user?.branchId ?? null,
    studentBranchId: studentUser?.branchId ?? null,
    assignedTeacherId: studentUser?.assignedTeacherId ?? null,
    familyLinked
  });
}

router.use(authenticate, generalLimiter);

router.get('/me', authorize(['student', 'parent', 'family_student']), async (req, res, next) => {
  try {
    const role = String(req.user?.canonicalRole ?? req.user?.role ?? '');
    let studentIds: string[] = [];

    if (role === 'student') {
      studentIds = [String(req.user?.userId ?? '')];
    } else {
      const familyUser = await User.findById(req.user?.userId).select('familyId parentProfileId').lean<any>();
      const students = await Student.find({
        isDeleted: false,
        ...(familyUser?.familyId ? { familyId: familyUser.familyId } : {}),
        ...(!familyUser?.familyId && familyUser?.parentProfileId ? { parentProfileId: familyUser.parentProfileId } : {})
      }).select('studentId').lean<any[]>();
      const userStudents = students.length
        ? await User.find({ role: 'student', isDeleted: false, studentId: { $in: students.map((item) => item.studentId).filter(Boolean) } }).select('_id').lean<any[]>()
        : [];
      studentIds = userStudents.map((item) => String(item._id));
    }

    if (!studentIds.length) {
      return res.json(createResponse({ insight: null, totalInsights: 0, highRiskCount: 0 }));
    }

    const [insight, totalInsights, highRiskCount] = await Promise.all([
      AIResultInsight.findOne({ studentId: { $in: studentIds }, isDeleted: false }).sort({ createdAt: -1 }).lean(),
      AIResultInsight.countDocuments({ studentId: { $in: studentIds }, isDeleted: false }),
      AIResultInsight.countDocuments({ studentId: { $in: studentIds }, isDeleted: false, riskLevel: 'high' })
    ]);

    return res.json(createResponse({
      insight: insight ?? null,
      totalInsights,
      highRiskCount
    }));
  } catch (error) {
    next(error);
  }
});

router.get('/result/:resultId', authorize(['super_admin', 'admin', 'owner', 'branch_manager', 'teacher', 'student', 'parent', 'family_student']), validate(resultParamsSchema), async (req, res, next) => {
  try {
    const result = await Result.findById(req.params.resultId).select('student exam').lean<any>();
    if (!result) return res.status(404).json(createError('Result not found'));
    const allowed = await assertStudentAccess(req, String(result.student));
    if (!allowed) return res.status(403).json(createError('Access denied'));
    const insight = await getStoredOrCreateAIResultInsight({
      resultId: req.params.resultId,
      actorId: req.user?.userId ?? null
    });
    return res.json(createResponse(insight));
  } catch (error) {
    next(error);
  }
});

router.get('/student/:studentId', authorize(['super_admin', 'admin', 'owner', 'branch_manager', 'teacher', 'student', 'parent', 'family_student']), validate(studentParamsSchema), async (req, res, next) => {
  try {
    const allowed = await assertStudentAccess(req, req.params.studentId);
    if (!allowed) return res.status(403).json(createError('Access denied'));
    const insights = await AIResultInsight.find({ studentId: req.params.studentId, isDeleted: false }).sort({ createdAt: -1 }).lean();
    res.json(createResponse(insights));
  } catch (error) {
    next(error);
  }
});

router.get('/exam/:examId', authorize(['super_admin', 'admin', 'owner', 'branch_manager', 'teacher']), validate(examParamsSchema), async (req, res, next) => {
  try {
    const exam = await Exam.findById(req.params.examId).lean<any>();
    if (!exam) return res.status(404).json(createError('Exam not found'));
    const role = String(req.user?.canonicalRole ?? req.user?.role ?? '');
    if (role === 'branch_manager' && String(exam.branchId ?? '') !== String(req.user?.branchId ?? '')) {
      return res.status(403).json(createError('Access denied'));
    }
    if (role === 'teacher' && String(exam.teacherId ?? '') !== String(req.user?.userId ?? '')) {
      return res.status(403).json(createError('Access denied'));
    }
    const insights = await AIResultInsight.find({ examId: req.params.examId, isDeleted: false }).sort({ createdAt: -1 }).lean();
    const classInsight = await AIClassExamInsight.findOne({ examId: req.params.examId, classId: exam.class, isDeleted: false }).lean();
    res.json(createResponse({ insights, classInsight }));
  } catch (error) {
    next(error);
  }
});

router.get('/class/:classId', authorize(['super_admin', 'admin', 'owner', 'branch_manager', 'teacher']), validate(classParamsSchema), async (req, res, next) => {
  try {
    const role = String(req.user?.canonicalRole ?? req.user?.role ?? '');
    const filter: Record<string, unknown> = { classId: req.params.classId, isDeleted: false };
    if (role === 'teacher') {
      const examIds = await Exam.find({ class: req.params.classId, teacherId: req.user?.userId, isDeleted: false }).select('_id').lean();
      filter.examId = { $in: examIds.map((item: any) => item._id) };
    }
    if (role === 'branch_manager') {
      filter.branchId = req.user?.branchId ?? null;
    }
    const classInsights = await AIClassExamInsight.find(filter).sort({ createdAt: -1 }).lean();
    res.json(createResponse(classInsights));
  } catch (error) {
    next(error);
  }
});

router.post('/generate/:resultId', authLimiter, authorize(['super_admin', 'admin', 'branch_manager', 'teacher', 'student', 'parent', 'family_student']), validate(resultParamsSchema), async (req, res, next) => {
  try {
    const result = await Result.findById(req.params.resultId).populate('exam', 'teacherId branchId').lean<any>();
    if (!result) return res.status(404).json(createError('Result not found'));
    const exam = result.exam as any;
    const role = String(req.user?.canonicalRole ?? req.user?.role ?? '');
    if (role === 'teacher' && String(exam?.teacherId ?? '') !== String(req.user?.userId ?? '')) {
      return res.status(403).json(createError('Access denied'));
    }
    if (role === 'branch_manager' && String(exam?.branchId ?? '') !== String(req.user?.branchId ?? '')) {
      return res.status(403).json(createError('Access denied'));
    }
    if (!isPrivilegedRole(role) && role !== 'teacher' && role !== 'branch_manager') {
      const allowed = await assertStudentAccess(req, String(result.student));
      if (!allowed) return res.status(403).json(createError('Access denied'));
    }
    const insight = await upsertAIResultInsight({
      resultId: req.params.resultId,
      actorId: req.user?.userId ?? null,
      force: true
    });
    await auditService.recordAction({
      actorId: String(req.user?.userId ?? 'system'),
      branchId: (insight as any)?.branchId?.toString?.() ?? null,
      action: 'AI_RESULT_INSIGHT_GENERATED',
      target: req.params.resultId,
      targetType: 'result',
      severity: 'info'
    });
    res.json(createResponse(insight, 'AI insight generated'));
  } catch (error) {
    next(error);
  }
});

router.post('/generate-exam/:examId', authLimiter, authorize(['super_admin', 'admin', 'branch_manager', 'teacher']), validate(examParamsSchema), async (req, res, next) => {
  try {
    const exam = await Exam.findById(req.params.examId).lean<any>();
    if (!exam) return res.status(404).json(createError('Exam not found'));
    const role = String(req.user?.canonicalRole ?? req.user?.role ?? '');
    if (role === 'teacher' && String(exam.teacherId ?? '') !== String(req.user?.userId ?? '')) {
      return res.status(403).json(createError('Access denied'));
    }
    if (role === 'branch_manager' && String(exam.branchId ?? '') !== String(req.user?.branchId ?? '')) {
      return res.status(403).json(createError('Access denied'));
    }
    const classInsight = await generateExamInsights(req.params.examId);
    await auditService.recordAction({
      actorId: String(req.user?.userId ?? 'system'),
      branchId: (classInsight as any)?.branchId?.toString?.() ?? null,
      action: 'AI_EXAM_CLASS_INSIGHT_GENERATED',
      target: req.params.examId,
      targetType: 'exam',
      severity: 'info'
    });
    res.json(createResponse(classInsight, 'Exam AI insights generated'));
  } catch (error) {
    next(error);
  }
});

export const aiResultsRouter = router;

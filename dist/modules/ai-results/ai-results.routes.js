"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiResultsRouter = void 0;
const express_1 = require("express");
const joi_1 = __importDefault(require("joi"));
const auth_1 = require("../../middlewares/auth");
const validate_1 = require("../../middlewares/validate");
const response_1 = require("../../helpers/response");
const rateLimiter_1 = require("../../middlewares/rateLimiter");
const AIClassExamInsight_1 = require("../../models/AIClassExamInsight");
const AIResultInsight_1 = require("../../models/AIResultInsight");
const Exam_1 = require("../../models/Exam");
const Result_1 = require("../../models/Result");
const Student_1 = require("../../models/Student");
const User_1 = require("../../models/User");
const auditService_1 = require("../../services/auditService");
const ai_results_access_1 = require("./ai-results.access");
const aiResultAnalysis_service_1 = require("./aiResultAnalysis.service");
const router = (0, express_1.Router)();
const auditService = new auditService_1.AuditService();
const studentParamsSchema = joi_1.default.object({
    params: joi_1.default.object({ studentId: joi_1.default.string().hex().length(24).required() })
});
const examParamsSchema = joi_1.default.object({
    params: joi_1.default.object({ examId: joi_1.default.string().hex().length(24).required() })
});
const classParamsSchema = joi_1.default.object({
    params: joi_1.default.object({ classId: joi_1.default.string().hex().length(24).required() })
});
const resultParamsSchema = joi_1.default.object({
    params: joi_1.default.object({ resultId: joi_1.default.string().hex().length(24).required() })
});
async function assertStudentAccess(req, studentId) {
    const role = String(req.user?.canonicalRole ?? req.user?.role ?? '');
    if ((0, ai_results_access_1.isPrivilegedRole)(role))
        return true;
    const studentUser = await User_1.User.findById(studentId).select('assignedTeacherId branchId studentId').lean();
    let familyLinked = false;
    if (role === 'parent' || role === 'family_student') {
        const familyUser = await User_1.User.findById(req.user.userId).select('familyId parentProfileId').lean();
        const studentRecord = await Student_1.Student.findOne({ studentId: studentUser?.studentId, isDeleted: false }).select('familyId parentProfileId').lean();
        const linkedByFamily = familyUser?.familyId && studentRecord?.familyId && String(studentRecord.familyId) === String(familyUser.familyId);
        const linkedByParent = !familyUser?.familyId && familyUser?.parentProfileId && studentRecord?.parentProfileId && String(studentRecord.parentProfileId) === String(familyUser.parentProfileId);
        familyLinked = Boolean(linkedByFamily || linkedByParent);
    }
    return (0, ai_results_access_1.canAccessStudentInsight)({
        role,
        requestUserId: String(req.user?.userId ?? ''),
        studentId: String(studentId),
        requestBranchId: req.user?.branchId ?? null,
        studentBranchId: studentUser?.branchId ?? null,
        assignedTeacherId: studentUser?.assignedTeacherId ?? null,
        familyLinked
    });
}
router.use(auth_1.authenticate, rateLimiter_1.generalLimiter);
router.get('/me', (0, auth_1.authorize)(['student', 'parent', 'family_student']), async (req, res, next) => {
    try {
        const role = String(req.user?.canonicalRole ?? req.user?.role ?? '');
        let studentIds = [];
        if (role === 'student') {
            studentIds = [String(req.user?.userId ?? '')];
        }
        else {
            const familyUser = await User_1.User.findById(req.user?.userId).select('familyId parentProfileId').lean();
            const students = await Student_1.Student.find({
                isDeleted: false,
                ...(familyUser?.familyId ? { familyId: familyUser.familyId } : {}),
                ...(!familyUser?.familyId && familyUser?.parentProfileId ? { parentProfileId: familyUser.parentProfileId } : {})
            }).select('studentId').lean();
            const userStudents = students.length
                ? await User_1.User.find({ role: 'student', isDeleted: false, studentId: { $in: students.map((item) => item.studentId).filter(Boolean) } }).select('_id').lean()
                : [];
            studentIds = userStudents.map((item) => String(item._id));
        }
        if (!studentIds.length) {
            return res.json((0, response_1.createResponse)({ insight: null, totalInsights: 0, highRiskCount: 0 }));
        }
        const [insight, totalInsights, highRiskCount] = await Promise.all([
            AIResultInsight_1.AIResultInsight.findOne({ studentId: { $in: studentIds }, isDeleted: false }).sort({ createdAt: -1 }).lean(),
            AIResultInsight_1.AIResultInsight.countDocuments({ studentId: { $in: studentIds }, isDeleted: false }),
            AIResultInsight_1.AIResultInsight.countDocuments({ studentId: { $in: studentIds }, isDeleted: false, riskLevel: 'high' })
        ]);
        return res.json((0, response_1.createResponse)({
            insight: insight ?? null,
            totalInsights,
            highRiskCount
        }));
    }
    catch (error) {
        next(error);
    }
});
router.get('/result/:resultId', (0, auth_1.authorize)(['super_admin', 'admin', 'owner', 'branch_manager', 'teacher', 'student', 'parent', 'family_student']), (0, validate_1.validate)(resultParamsSchema), async (req, res, next) => {
    try {
        const result = await Result_1.Result.findById(req.params.resultId).select('student exam').lean();
        if (!result)
            return res.status(404).json((0, response_1.createError)('Result not found'));
        const allowed = await assertStudentAccess(req, String(result.student));
        if (!allowed)
            return res.status(403).json((0, response_1.createError)('Access denied'));
        const insight = await (0, aiResultAnalysis_service_1.getStoredOrCreateAIResultInsight)({
            resultId: req.params.resultId,
            actorId: req.user?.userId ?? null
        });
        return res.json((0, response_1.createResponse)(insight));
    }
    catch (error) {
        next(error);
    }
});
router.get('/student/:studentId', (0, auth_1.authorize)(['super_admin', 'admin', 'owner', 'branch_manager', 'teacher', 'student', 'parent', 'family_student']), (0, validate_1.validate)(studentParamsSchema), async (req, res, next) => {
    try {
        const allowed = await assertStudentAccess(req, req.params.studentId);
        if (!allowed)
            return res.status(403).json((0, response_1.createError)('Access denied'));
        const insights = await AIResultInsight_1.AIResultInsight.find({ studentId: req.params.studentId, isDeleted: false }).sort({ createdAt: -1 }).lean();
        res.json((0, response_1.createResponse)(insights));
    }
    catch (error) {
        next(error);
    }
});
router.get('/exam/:examId', (0, auth_1.authorize)(['super_admin', 'admin', 'owner', 'branch_manager', 'teacher']), (0, validate_1.validate)(examParamsSchema), async (req, res, next) => {
    try {
        const exam = await Exam_1.Exam.findById(req.params.examId).lean();
        if (!exam)
            return res.status(404).json((0, response_1.createError)('Exam not found'));
        const role = String(req.user?.canonicalRole ?? req.user?.role ?? '');
        if (role === 'branch_manager' && String(exam.branchId ?? '') !== String(req.user?.branchId ?? '')) {
            return res.status(403).json((0, response_1.createError)('Access denied'));
        }
        if (role === 'teacher' && String(exam.teacherId ?? '') !== String(req.user?.userId ?? '')) {
            return res.status(403).json((0, response_1.createError)('Access denied'));
        }
        const insights = await AIResultInsight_1.AIResultInsight.find({ examId: req.params.examId, isDeleted: false }).sort({ createdAt: -1 }).lean();
        const classInsight = await AIClassExamInsight_1.AIClassExamInsight.findOne({ examId: req.params.examId, classId: exam.class, isDeleted: false }).lean();
        res.json((0, response_1.createResponse)({ insights, classInsight }));
    }
    catch (error) {
        next(error);
    }
});
router.get('/class/:classId', (0, auth_1.authorize)(['super_admin', 'admin', 'owner', 'branch_manager', 'teacher']), (0, validate_1.validate)(classParamsSchema), async (req, res, next) => {
    try {
        const role = String(req.user?.canonicalRole ?? req.user?.role ?? '');
        const filter = { classId: req.params.classId, isDeleted: false };
        if (role === 'teacher') {
            const examIds = await Exam_1.Exam.find({ class: req.params.classId, teacherId: req.user?.userId, isDeleted: false }).select('_id').lean();
            filter.examId = { $in: examIds.map((item) => item._id) };
        }
        if (role === 'branch_manager') {
            filter.branchId = req.user?.branchId ?? null;
        }
        const classInsights = await AIClassExamInsight_1.AIClassExamInsight.find(filter).sort({ createdAt: -1 }).lean();
        res.json((0, response_1.createResponse)(classInsights));
    }
    catch (error) {
        next(error);
    }
});
router.post('/generate/:resultId', rateLimiter_1.authLimiter, (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'teacher', 'student', 'parent', 'family_student']), (0, validate_1.validate)(resultParamsSchema), async (req, res, next) => {
    try {
        const result = await Result_1.Result.findById(req.params.resultId).populate('exam', 'teacherId branchId').lean();
        if (!result)
            return res.status(404).json((0, response_1.createError)('Result not found'));
        const exam = result.exam;
        const role = String(req.user?.canonicalRole ?? req.user?.role ?? '');
        if (role === 'teacher' && String(exam?.teacherId ?? '') !== String(req.user?.userId ?? '')) {
            return res.status(403).json((0, response_1.createError)('Access denied'));
        }
        if (role === 'branch_manager' && String(exam?.branchId ?? '') !== String(req.user?.branchId ?? '')) {
            return res.status(403).json((0, response_1.createError)('Access denied'));
        }
        if (!(0, ai_results_access_1.isPrivilegedRole)(role) && role !== 'teacher' && role !== 'branch_manager') {
            const allowed = await assertStudentAccess(req, String(result.student));
            if (!allowed)
                return res.status(403).json((0, response_1.createError)('Access denied'));
        }
        const insight = await (0, aiResultAnalysis_service_1.upsertAIResultInsight)({
            resultId: req.params.resultId,
            actorId: req.user?.userId ?? null,
            force: true
        });
        await auditService.recordAction({
            actorId: String(req.user?.userId ?? 'system'),
            branchId: insight?.branchId?.toString?.() ?? null,
            action: 'AI_RESULT_INSIGHT_GENERATED',
            target: req.params.resultId,
            targetType: 'result',
            severity: 'info'
        });
        res.json((0, response_1.createResponse)(insight, 'AI insight generated'));
    }
    catch (error) {
        next(error);
    }
});
router.post('/generate-exam/:examId', rateLimiter_1.authLimiter, (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'teacher']), (0, validate_1.validate)(examParamsSchema), async (req, res, next) => {
    try {
        const exam = await Exam_1.Exam.findById(req.params.examId).lean();
        if (!exam)
            return res.status(404).json((0, response_1.createError)('Exam not found'));
        const role = String(req.user?.canonicalRole ?? req.user?.role ?? '');
        if (role === 'teacher' && String(exam.teacherId ?? '') !== String(req.user?.userId ?? '')) {
            return res.status(403).json((0, response_1.createError)('Access denied'));
        }
        if (role === 'branch_manager' && String(exam.branchId ?? '') !== String(req.user?.branchId ?? '')) {
            return res.status(403).json((0, response_1.createError)('Access denied'));
        }
        const classInsight = await (0, aiResultAnalysis_service_1.generateExamInsights)(req.params.examId);
        await auditService.recordAction({
            actorId: String(req.user?.userId ?? 'system'),
            branchId: classInsight?.branchId?.toString?.() ?? null,
            action: 'AI_EXAM_CLASS_INSIGHT_GENERATED',
            target: req.params.examId,
            targetType: 'exam',
            severity: 'info'
        });
        res.json((0, response_1.createResponse)(classInsight, 'Exam AI insights generated'));
    }
    catch (error) {
        next(error);
    }
});
exports.aiResultsRouter = router;

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resultRouter = void 0;
const express_1 = require("express");
const joi_1 = __importDefault(require("joi"));
const Result_1 = require("../../models/Result");
const Student_1 = require("../../models/Student");
const User_1 = require("../../models/User");
const Exam_1 = require("../../models/Exam");
const LearningResource_1 = require("../../models/LearningResource");
const Book_1 = require("../../models/Book");
const scheduleResultInsight_1 = require("../ai-results/scheduleResultInsight");
const auth_1 = require("../../middlewares/auth");
const validate_1 = require("../../middlewares/validate");
const response_1 = require("../../helpers/response");
const router = (0, express_1.Router)();
const resultSchema = joi_1.default.object({
    body: joi_1.default.object({
        student: joi_1.default.string().hex().length(24).required(),
        exam: joi_1.default.string().hex().length(24).required(),
        score: joi_1.default.number().min(0).required(),
        remarks: joi_1.default.string().allow('', null).optional(),
        gradedBy: joi_1.default.string().hex().length(24).optional()
    })
});
const resultQuerySchema = joi_1.default.object({
    query: joi_1.default.object({
        page: joi_1.default.number().integer().min(1).default(1),
        limit: joi_1.default.number().integer().min(1).max(100).default(20),
        search: joi_1.default.string().allow('', null).optional(),
        lang: joi_1.default.string().valid('en', 'fa', 'ps').optional()
    })
});
const updateResultSchema = joi_1.default.object({
    body: joi_1.default.object({
        score: joi_1.default.number().min(0).optional(),
        remarks: joi_1.default.string().allow('', null).optional(),
        lang: joi_1.default.string().valid('en', 'fa', 'ps').optional()
    }).min(1)
});
function deriveGrade(score, totalMarks) {
    const percentage = totalMarks > 0 ? (score / totalMarks) * 100 : 0;
    if (percentage >= 90)
        return 'A';
    if (percentage >= 80)
        return 'B';
    if (percentage >= 70)
        return 'C';
    if (percentage >= 60)
        return 'D';
    if (percentage >= 40)
        return 'E';
    return 'F';
}
function buildAcademicRecommendation(result, language = 'en') {
    const score = Number(result?.score || 0);
    const totalMarks = Number(result?.exam?.totalMarks || 100);
    const percentage = totalMarks > 0 ? Math.round((score / totalMarks) * 100) : 0;
    const subjectName = result?.exam?.subject?.title || 'this subject';
    const weak = percentage < 60;
    const strong = percentage >= 85;
    const copy = {
        en: {
            weakTitle: 'Improvement plan recommended',
            strongTitle: 'Excellent achievement',
            steadyTitle: 'Keep building mastery',
            weakMessage: `Focus on ${subjectName}. Review short lessons, solve daily practice questions, and ask your teacher for a two-week support plan.`,
            strongMessage: `Congratulations on a strong ${subjectName} result. Keep reviewing advanced exercises and help strengthen your long-term mastery.`,
            steadyMessage: `Your ${subjectName} progress is developing. Continue weekly revision, practice past questions, and track mistakes after each study session.`,
            resources: ['Teacher lesson notes', 'Short educational videos', 'Practice worksheets', 'Reference book chapter', 'PDF revision guide'],
            weakPlan: ['Review core lesson', 'Practice 20 minutes daily', 'Complete teacher feedback', 'Retake weak-topic quiz'],
            regularPlan: ['Maintain weekly revision', 'Practice advanced questions', 'Track next exam target']
        },
        fa: {
            weakTitle: 'برنامه بهبود پیشنهاد می‌شود',
            strongTitle: 'دستاورد عالی',
            steadyTitle: 'تسلط خود را ادامه دهید',
            weakMessage: `روی ${subjectName} تمرکز کنید. درس‌های کوتاه را مرور کنید، تمرین روزانه حل کنید و از معلم برنامه حمایتی دوهفته‌ای بخواهید.`,
            strongMessage: `برای نتیجه عالی در ${subjectName} تبریک می‌گوییم. تمرین‌های پیشرفته را ادامه دهید و تسلط درازمدت خود را تقویت کنید.`,
            steadyMessage: `پیشرفت شما در ${subjectName} در حال رشد است. مرور هفتگی، تمرین سوالات گذشته و بررسی اشتباهات را ادامه دهید.`,
            resources: ['یادداشت‌های درسی معلم', 'ویدیوهای آموزشی کوتاه', 'تمرین‌های عملی', 'فصل کتاب مرجع', 'راهنمای مرور PDF'],
            weakPlan: ['مرور درس اصلی', 'روزانه ۲۰ دقیقه تمرین', 'اجرای بازخورد معلم', 'آزمون دوباره مبحث ضعیف'],
            regularPlan: ['مرور هفتگی را ادامه دهید', 'تمرین سوالات پیشرفته', 'هدف امتحان بعدی را مشخص کنید']
        },
        ps: {
            weakTitle: 'د ښه والي پلان سپارښتنه کېږي',
            strongTitle: 'غوره لاسته راوړنه',
            steadyTitle: 'خپله پوهه نوره هم پیاوړې کړئ',
            weakMessage: `پر ${subjectName} تمرکز وکړئ. لنډ درسونه تکرار کړئ، ورځنۍ پوښتنې حل کړئ او له ښوونکي څخه دوه اونیز ملاتړ پلان وغواړئ.`,
            strongMessage: `په ${subjectName} کې د غوره پایلې مبارکي. پرمختللي تمرینونه دوام ورکړئ او خپله اوږدمهاله پوهه پیاوړې کړئ.`,
            steadyMessage: `په ${subjectName} کې ستاسو پرمختګ روان دی. اونیز تکرار، پخوانۍ پوښتنې او د تېروتنو څارنه دوام ورکړئ.`,
            resources: ['د ښوونکي درسي یادښتونه', 'لنډې ښوونیزې ویډیوګانې', 'تمرین پاڼې', 'د مرجع کتاب فصل', 'PDF تکراري لارښود'],
            weakPlan: ['اصلي درس بیا تکرار کړئ', 'هره ورځ ۲۰ دقیقې تمرین', 'د ښوونکي فیډبک عملي کړئ', 'د کمزورې موضوع ازموینه بیا ورکړئ'],
            regularPlan: ['اونیز تکرار دوام ورکړئ', 'پرمختللې پوښتنې حل کړئ', 'د راتلونکې ازموینې هدف وټاکئ']
        }
    };
    const selected = copy[language] ?? copy.en;
    return {
        percentage,
        status: weak ? 'needs_support' : strong ? 'excellent' : 'progressing',
        title: weak ? selected.weakTitle : strong ? selected.strongTitle : selected.steadyTitle,
        message: weak ? selected.weakMessage : strong ? selected.strongMessage : selected.steadyMessage,
        resources: selected.resources,
        studyPlan: weak
            ? selected.weakPlan
            : selected.regularPlan
    };
}
async function buildTargetedLearningResources(result, language = 'en') {
    const subjectId = result?.exam?.subject?._id ?? result?.exam?.subject ?? result?.subjectId ?? null;
    const classId = result?.exam?.class?._id ?? result?.exam?.class ?? result?.classId ?? null;
    const branchId = result?.student?.branchId ?? null;
    const localizedLabel = {
        en: { video: 'Video', book: 'Book', link: 'Link', document: 'Document' },
        fa: { video: 'ویدیو', book: 'کتاب', link: 'لینک', document: 'سند' },
        ps: { video: 'ویډیو', book: 'کتاب', link: 'لینک', document: 'سند' }
    };
    const labels = localizedLabel[language] ?? localizedLabel.en;
    const resourceFilter = { published: true };
    if (subjectId)
        resourceFilter.subjectId = subjectId;
    if (classId)
        resourceFilter.$or = [{ classId }, { classId: null }];
    if (branchId)
        resourceFilter.$and = [{ $or: [{ branchId }, { branchId: null }] }];
    const [learningResources, books] = await Promise.all([
        LearningResource_1.LearningResource.find(resourceFilter)
            .select('title type url description')
            .sort({ updatedAt: -1 })
            .limit(5)
            .lean(),
        Book_1.Book.find(subjectId ? { available: true, isDeleted: false, title: { $regex: String(result?.exam?.subject?.title || ''), $options: 'i' } } : { available: true, isDeleted: false })
            .select('title author category price')
            .sort({ updatedAt: -1 })
            .limit(3)
            .lean()
    ]);
    const mappedResources = learningResources.map((item) => ({
        title: item.title,
        kind: item.type,
        kindLabel: labels[item.type] ?? item.type,
        description: item.description || '',
        url: item.url || ''
    }));
    const mappedBooks = books.map((item) => ({
        title: item.title,
        kind: 'book',
        kindLabel: labels.book,
        description: item.author ? `${item.author}${item.category ? ` • ${item.category}` : ''}` : (item.category || ''),
        url: ''
    }));
    return [...mappedResources, ...mappedBooks].slice(0, 8);
}
async function resolveStudentContext(studentIdentifier) {
    const directUser = await User_1.User.findOne({ _id: studentIdentifier, role: 'student', isDeleted: false }).lean();
    if (directUser) {
        const studentRecord = directUser.studentId
            ? await Student_1.Student.findOne({ studentId: directUser.studentId, isDeleted: false }).lean()
            : null;
        return {
            studentUser: directUser,
            studentRecord
        };
    }
    const studentRecord = await Student_1.Student.findOne({ _id: studentIdentifier, isDeleted: false }).lean();
    if (!studentRecord) {
        return null;
    }
    const linkedUser = await User_1.User.findOne({ studentId: studentRecord.studentId, role: 'student', isDeleted: false }).lean();
    if (!linkedUser) {
        return null;
    }
    return {
        studentUser: linkedUser,
        studentRecord
    };
}
async function serializeResult(result, language = 'en') {
    const studentName = result?.student?.name ??
        [result?.student?.firstName, result?.student?.lastName].filter(Boolean).join(' ').trim();
    const aiRecommendation = buildAcademicRecommendation(result, language);
    const recommendedResources = await buildTargetedLearningResources(result, language);
    return {
        ...result,
        studentName: studentName || result?.student?.email || '',
        examName: result?.exam?.title ?? '',
        subjectName: result?.exam?.subject?.title ?? '',
        className: result?.exam?.class?.className ?? result?.exam?.class?.name ?? '',
        teacherName: result?.exam?.teacherId?.name ?? result?.gradedBy?.name ?? '',
        totalMarks: result?.exam?.totalMarks ?? null,
        aiRecommendation,
        aiSuggestedResources: recommendedResources,
        aiRecommendationTitle: aiRecommendation.title,
        aiRecommendationMessage: aiRecommendation.message
    };
}
router.use(auth_1.authenticate);
router.post('/', (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'teacher']), (0, validate_1.validate)(resultSchema), async (req, res, next) => {
    try {
        const [studentContext, exam] = await Promise.all([
            resolveStudentContext(req.body.student),
            Exam_1.Exam.findById(req.body.exam).lean()
        ]);
        const studentUser = studentContext?.studentUser ?? null;
        const studentRecord = studentContext?.studentRecord ?? null;
        if (!studentUser || Array.isArray(studentUser)) {
            return res.status(404).json((0, response_1.createError)('Student not found'));
        }
        if (!exam || Array.isArray(exam)) {
            return res.status(404).json((0, response_1.createError)('Exam not found'));
        }
        const studentClassId = studentRecord?.classId ?? studentUser.classId ?? null;
        const studentSubjectId = studentRecord?.subjectId ?? studentUser.subjectId ?? null;
        if (studentClassId && exam.class && String(studentClassId) !== String(exam.class)) {
            return res.status(400).json((0, response_1.createError)('Student is not assigned to the selected exam class'));
        }
        if (studentSubjectId && exam.subject && String(studentSubjectId) !== String(exam.subject)) {
            return res.status(400).json((0, response_1.createError)('Student is not assigned to the selected exam subject'));
        }
        const grade = deriveGrade(Number(req.body.score), Number(exam.totalMarks || 100));
        const result = await Result_1.Result.create({
            ...req.body,
            student: studentUser._id,
            grade,
            gradedBy: req.body.gradedBy ?? req.user?.userId ?? null
        });
        const populated = await Result_1.Result.findById(result._id)
            .populate('student', 'name firstName lastName email assignedTeacherId familyId')
            .populate({
            path: 'exam',
            select: 'title date totalMarks subject class teacherId',
            populate: [
                { path: 'subject', select: 'title code' },
                { path: 'class', select: 'className name classCode' },
                { path: 'teacherId', select: 'name email' }
            ]
        })
            .populate('gradedBy', 'name email')
            .lean();
        (0, scheduleResultInsight_1.scheduleResultInsightGeneration)(String(result._id), req.user?.userId ?? null);
        const language = String(req.query.lang || req.body.lang || 'en');
        res.status(201).json((0, response_1.createResponse)(await serializeResult(populated, language), 'Result created'));
    }
    catch (error) {
        next(error);
    }
});
router.get('/', (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'teacher', 'student', 'family_student', 'parent', 'owner']), (0, validate_1.validate)(resultQuerySchema), async (req, res, next) => {
    try {
        const page = Number(req.query.page || 1);
        const limit = Number(req.query.limit || 20);
        const search = String(req.query.search || '').trim();
        const filter = {};
        if (search) {
            filter.score = { $gte: Number(search) || 0 };
        }
        if (req.user?.canonicalRole === 'student') {
            filter.student = req.user.userId;
        }
        if (req.user?.canonicalRole === 'parent' || req.user?.role === 'family_student') {
            const familyUser = await User_1.User.findById(req.user.userId).select('familyId parentProfileId').lean();
            const linkedStudents = await Student_1.Student.find({
                isDeleted: false,
                ...(familyUser?.familyId ? { familyId: familyUser.familyId } : {}),
                ...(!familyUser?.familyId && familyUser?.parentProfileId ? { parentProfileId: familyUser.parentProfileId } : {})
            }).select('studentId').lean();
            const children = linkedStudents.length
                ? await User_1.User.find({ role: 'student', isDeleted: false, studentId: { $in: linkedStudents.map((item) => item.studentId).filter(Boolean) } }).select('_id').lean()
                : [];
            filter.student = { $in: children.map((child) => child._id) };
        }
        if (req.user?.canonicalRole === 'teacher') {
            const linkedStudents = await Student_1.Student.find({ teacherId: req.user.userId, isDeleted: false }).select('studentId').lean();
            const students = linkedStudents.length
                ? await User_1.User.find({ role: 'student', isDeleted: false, studentId: { $in: linkedStudents.map((item) => item.studentId).filter(Boolean) } }).select('_id').lean()
                : [];
            filter.student = { $in: students.map((student) => student._id) };
        }
        const [results, total] = await Promise.all([
            Result_1.Result.find(filter)
                .populate('student', 'name firstName lastName email assignedTeacherId familyId')
                .populate({
                path: 'exam',
                select: 'title date totalMarks subject class teacherId',
                populate: [
                    { path: 'subject', select: 'title code' },
                    { path: 'class', select: 'className name classCode' },
                    { path: 'teacherId', select: 'name email' }
                ]
            })
                .populate('gradedBy', 'name email')
                .lean()
                .skip((page - 1) * limit)
                .limit(limit),
            Result_1.Result.countDocuments(filter)
        ]);
        const language = String(req.query.lang || 'en');
        const serializedResults = await Promise.all(results.map((result) => serializeResult(result, language)));
        res.json((0, response_1.createResponse)(serializedResults, '', { page, limit, total }));
    }
    catch (error) {
        next(error);
    }
});
router.post('/:id/ai-recommendation', (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'teacher', 'student', 'family_student', 'parent', 'owner']), async (req, res, next) => {
    try {
        const result = await Result_1.Result.findById(req.params.id)
            .populate('student', 'name firstName lastName email familyId assignedTeacherId')
            .populate({
            path: 'exam',
            select: 'title date totalMarks subject class teacherId',
            populate: [
                { path: 'subject', select: 'title code description' },
                { path: 'class', select: 'className name classCode' },
                { path: 'teacherId', select: 'name email' }
            ]
        })
            .populate('gradedBy', 'name email')
            .lean();
        if (!result)
            return res.status(404).json((0, response_1.createError)('Result not found'));
        if (req.user?.canonicalRole === 'student' && result.student._id.toString() !== req.user.userId) {
            return res.status(403).json((0, response_1.createError)('Access denied'));
        }
        if (req.user?.canonicalRole === 'teacher' && result.student.assignedTeacherId?.toString() !== req.user.userId) {
            return res.status(403).json((0, response_1.createError)('Access denied'));
        }
        if (req.user?.canonicalRole === 'parent' || req.user?.role === 'family_student') {
            const familyUser = await User_1.User.findById(req.user.userId).select('familyId parentProfileId').lean();
            const studentRecord = await Student_1.Student.findOne({ studentId: result.student?.studentId, isDeleted: false }).select('familyId parentProfileId').lean();
            const linkedByFamily = familyUser?.familyId && studentRecord?.familyId && String(studentRecord.familyId) === String(familyUser.familyId);
            const linkedByParentProfile = !familyUser?.familyId && familyUser?.parentProfileId && studentRecord?.parentProfileId && String(studentRecord.parentProfileId) === String(familyUser.parentProfileId);
            if (!linkedByFamily && !linkedByParentProfile) {
                return res.status(403).json((0, response_1.createError)('Access denied'));
            }
        }
        const language = String(req.body?.lang || req.query.lang || 'en');
        const recommendation = buildAcademicRecommendation(result, language);
        const recommendedResources = await buildTargetedLearningResources(result, language);
        res.json((0, response_1.createResponse)({
            resultId: req.params.id,
            studentName: result.student?.name ?? [result.student?.firstName, result.student?.lastName].filter(Boolean).join(' '),
            subjectName: result.exam?.subject?.title ?? '',
            score: result.score,
            totalMarks: result.exam?.totalMarks ?? 100,
            recommendation: {
                ...recommendation,
                suggestedResources: recommendedResources
            }
        }, 'AI recommendation generated successfully'));
    }
    catch (error) {
        next(error);
    }
});
router.get('/:id', (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'teacher', 'student', 'family_student', 'parent', 'owner']), async (req, res, next) => {
    try {
        const result = await Result_1.Result.findById(req.params.id)
            .populate('student', 'name firstName lastName email familyId assignedTeacherId')
            .populate({
            path: 'exam',
            select: 'title date totalMarks subject class teacherId',
            populate: [
                { path: 'subject', select: 'title code' },
                { path: 'class', select: 'className name classCode' },
                { path: 'teacherId', select: 'name email' }
            ]
        })
            .populate('gradedBy', 'name email')
            .lean();
        if (!result)
            return res.status(404).json((0, response_1.createError)('Result not found'));
        if (req.user?.canonicalRole === 'student' && result.student._id.toString() !== req.user.userId) {
            return res.status(403).json((0, response_1.createError)('Access denied'));
        }
        if (req.user?.canonicalRole === 'parent' || req.user?.role === 'family_student') {
            const familyUser = await User_1.User.findById(req.user.userId).select('familyId parentProfileId').lean();
            const studentRecord = await Student_1.Student.findOne({ studentId: result.student?.studentId, isDeleted: false }).select('familyId parentProfileId').lean();
            const linkedByFamily = familyUser?.familyId && studentRecord?.familyId && String(studentRecord.familyId) === String(familyUser.familyId);
            const linkedByParentProfile = !familyUser?.familyId && familyUser?.parentProfileId && studentRecord?.parentProfileId && String(studentRecord.parentProfileId) === String(familyUser.parentProfileId);
            if (!linkedByFamily && !linkedByParentProfile) {
                return res.status(403).json((0, response_1.createError)('Access denied'));
            }
        }
        if (req.user?.canonicalRole === 'teacher') {
            if (result.student.assignedTeacherId?.toString() !== req.user.userId) {
                return res.status(403).json((0, response_1.createError)('Access denied'));
            }
        }
        res.json((0, response_1.createResponse)(await serializeResult(result, String(req.query.lang || 'en'))));
    }
    catch (error) {
        next(error);
    }
});
router.patch('/:id', (0, auth_1.authorize)(['super_admin', 'admin', 'branch_manager', 'teacher']), (0, validate_1.validate)(updateResultSchema), async (req, res, next) => {
    try {
        const existing = await Result_1.Result.findById(req.params.id)
            .populate('student', 'assignedTeacherId')
            .populate('exam', 'totalMarks')
            .lean();
        if (!existing)
            return res.status(404).json((0, response_1.createError)('Result not found'));
        if (req.user?.canonicalRole === 'teacher') {
            const assignedTeacherId = existing.student?.assignedTeacherId;
            if (!assignedTeacherId || String(assignedTeacherId) !== String(req.user?.userId)) {
                return res.status(403).json((0, response_1.createError)('Access denied'));
            }
        }
        const totalMarks = Number(existing.exam?.totalMarks || 100);
        const nextScore = req.body.score !== undefined ? Number(req.body.score) : Number(existing.score || 0);
        const grade = deriveGrade(nextScore, totalMarks);
        const updated = await Result_1.Result.findByIdAndUpdate(req.params.id, {
            ...(req.body.score !== undefined ? { score: nextScore, grade } : {}),
            ...(req.body.remarks !== undefined ? { remarks: req.body.remarks } : {}),
            gradedBy: req.user?.userId ?? null
        }, { new: true })
            .populate('student', 'name firstName lastName email assignedTeacherId familyId')
            .populate({
            path: 'exam',
            select: 'title date totalMarks subject class teacherId',
            populate: [
                { path: 'subject', select: 'title code' },
                { path: 'class', select: 'className name classCode' },
                { path: 'teacherId', select: 'name email' }
            ]
        })
            .populate('gradedBy', 'name email')
            .lean();
        if (!updated)
            return res.status(404).json((0, response_1.createError)('Result not found'));
        (0, scheduleResultInsight_1.scheduleResultInsightGeneration)(String(req.params.id), req.user?.userId ?? null);
        const language = String(req.body.lang || req.query.lang || 'en');
        res.json((0, response_1.createResponse)(await serializeResult(updated, language), 'Result updated'));
    }
    catch (error) {
        next(error);
    }
});
exports.resultRouter = router;

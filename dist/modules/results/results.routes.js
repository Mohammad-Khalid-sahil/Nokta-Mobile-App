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
const examScore_1 = require("../../utils/examScore");
const studyRecommendationService_1 = require("../../services/studyRecommendationService");
const router = (0, express_1.Router)();
const resultSchema = joi_1.default.object({
    body: joi_1.default.object({
        student: joi_1.default.string().hex().length(24).required(),
        exam: joi_1.default.string().hex().length(24).required(),
        score: joi_1.default.number().min(0).max(examScore_1.EXAM_SCORE_MAX).required(),
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
        score: joi_1.default.number().min(0).max(examScore_1.EXAM_SCORE_MAX).optional(),
        remarks: joi_1.default.string().allow('', null).optional(),
        lang: joi_1.default.string().valid('en', 'fa', 'ps').optional()
    }).min(1)
});
function compactDate(value) {
    if (!value)
        return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}
function buildAcademicRecommendation(result, language = 'en') {
    const score = Number(result?.score || 0);
    const percentage = Math.round(score);
    const subjectName = result?.exam?.subject?.title || 'this subject';
    const band = percentage >= 85 ? 'excellent' : percentage >= 60 ? 'good' : 'needs_improvement';
    const copy = {
        en: {
            excellent: {
                title: 'Excellent performance.',
                message: 'Excellent performance.',
                resources: ['Advanced materials.'],
                studyPlan: ['Advanced materials.']
            },
            good: {
                title: 'Good progress.',
                message: 'Good progress.',
                resources: ['Practice and revision.'],
                studyPlan: ['Practice and revision.']
            },
            needs_improvement: {
                title: 'Needs improvement.',
                message: 'Needs improvement.',
                resources: ['Basic lessons', 'Practice exercises', 'Related books'],
                studyPlan: ['Basic lessons', 'Practice exercises', 'Related books']
            }
        },
        fa: {
            excellent: {
                title: 'عملکرد عالی.',
                message: 'عملکرد عالی.',
                resources: ['مواد پیشرفته.'],
                studyPlan: ['مواد پیشرفته.']
            },
            good: {
                title: 'پیشرفت خوب.',
                message: 'پیشرفت خوب.',
                resources: ['تمرین و مرور.'],
                studyPlan: ['تمرین و مرور.']
            },
            needs_improvement: {
                title: 'نیازمند بهبود.',
                message: 'نیازمند بهبود.',
                resources: ['درس‌های پایه', 'تمرین‌های عملی', 'کتاب‌های مرتبط'],
                studyPlan: ['درس‌های پایه', 'تمرین‌های عملی', 'کتاب‌های مرتبط']
            }
        },
        ps: {
            excellent: {
                title: 'غوره کارکرد.',
                message: 'غوره کارکرد.',
                resources: ['پرمختللي مواد.'],
                studyPlan: ['پرمختللي مواد.']
            },
            good: {
                title: 'ښه پرمختګ.',
                message: 'ښه پرمختګ.',
                resources: ['تمرین او تکرار.'],
                studyPlan: ['تمرین او تکرار.']
            },
            needs_improvement: {
                title: 'ښه والي ته اړتیا لري.',
                message: 'ښه والي ته اړتیا لري.',
                resources: ['بنسټیز درسونه', 'تمریني تمرینونه', 'اړوند کتابونه'],
                studyPlan: ['بنسټیز درسونه', 'تمریني تمرینونه', 'اړوند کتابونه']
            }
        }
    };
    const selected = (copy[language] ?? copy.en)[band];
    return {
        percentage,
        status: band,
        subjectName,
        title: selected.title,
        message: selected.message,
        resources: selected.resources,
        studyPlan: selected.studyPlan
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
    const score = Number(result?.score ?? 0);
    const percentage = Number(score.toFixed(2));
    const passed = (0, examScore_1.isExamPassed)(score);
    const examId = result?.exam?._id ?? result?.exam ?? null;
    const rank = examId
        ? (await Result_1.Result.countDocuments({
            exam: examId,
            score: { $gt: score },
            isDeleted: { $ne: true }
        })) + 1
        : null;
    const { classroomActivityScore: _a, attendanceScore: _b, midtermScore: _c, finalExamScore: _d, scoreComponents: _e, ...rest } = result ?? {};
    return {
        ...rest,
        id: String(result?._id ?? result?.id ?? ''),
        _id: String(result?._id ?? result?.id ?? ''),
        studentName: studentName || result?.student?.email || '',
        examName: result?.exam?.title ?? '',
        examTitle: result?.exam?.title ?? '',
        examType: result?.exam?.examType ?? '',
        examDate: compactDate(result?.exam?.date),
        date: compactDate(result?.publishedAt ?? result?.createdAt ?? result?.exam?.date),
        subjectName: result?.exam?.subject?.title ?? '',
        className: result?.exam?.class?.className ?? result?.exam?.class?.name ?? '',
        teacherName: result?.exam?.teacherId?.name ?? result?.gradedBy?.name ?? '',
        correctedBy: result?.gradedBy?.name ?? '',
        gradedByName: result?.gradedBy?.name ?? '',
        score,
        totalScore: score,
        maximumScore: examScore_1.EXAM_SCORE_MAX,
        maxScore: examScore_1.EXAM_SCORE_MAX,
        totalMarks: examScore_1.EXAM_SCORE_MAX,
        passingMarks: examScore_1.EXAM_PASS_PERCENT,
        percentage,
        percent: percentage,
        grade: result?.grade ?? (0, examScore_1.deriveExamGrade)(score),
        passed,
        status: passed ? 'passed' : 'failed',
        rank,
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
        if (req.user?.canonicalRole === 'teacher' &&
            exam.teacherId &&
            String(exam.teacherId) !== String(req.user.userId)) {
            return res.status(403).json((0, response_1.createError)('Access denied'));
        }
        const studentClassId = studentRecord?.classId ?? studentUser.classId ?? null;
        const studentSubjectId = studentRecord?.subjectId ?? studentUser.subjectId ?? null;
        if (studentClassId && exam.class && String(studentClassId) !== String(exam.class)) {
            return res.status(400).json((0, response_1.createError)('Student is not assigned to the selected exam class'));
        }
        if (studentSubjectId && exam.subject && String(studentSubjectId) !== String(exam.subject)) {
            return res.status(400).json((0, response_1.createError)('Student is not assigned to the selected exam subject'));
        }
        const resolved = (0, examScore_1.resolveUnifiedExamScore)(req.body);
        if (resolved.score < 0 || resolved.score > examScore_1.EXAM_SCORE_MAX) {
            return res.status(400).json((0, response_1.createError)('Score must be between 0 and 100'));
        }
        const grade = (0, examScore_1.deriveExamGrade)(resolved.score);
        const result = await Result_1.Result.create({
            student: studentUser._id,
            exam: exam._id,
            classId: exam.class ?? studentClassId ?? null,
            subjectId: exam.subject ?? studentSubjectId ?? null,
            teacherId: exam.teacherId ?? req.user?.userId ?? null,
            score: resolved.score,
            remarks: req.body.remarks ?? '',
            grade,
            gradedBy: req.body.gradedBy ?? req.user?.userId ?? null
        });
        const populated = await Result_1.Result.findById(result._id)
            .populate('student', 'name firstName lastName email studentId assignedTeacherId familyId parentProfileId')
            .populate({
            path: 'exam',
            select: 'title date totalMarks examType subject class teacherId',
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
        if (error?.code === 11000) {
            return res.status(409).json((0, response_1.createError)('Result already exists for this student and exam'));
        }
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
                .populate('student', 'name firstName lastName email studentId assignedTeacherId familyId parentProfileId')
                .populate({
                path: 'exam',
                select: 'title date totalMarks examType subject class teacherId',
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
            .populate('student', 'name firstName lastName email studentId familyId parentProfileId assignedTeacherId')
            .populate({
            path: 'exam',
            select: 'title date totalMarks examType subject class teacherId',
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
            const resultStudent = result.student ?? {};
            const linkedByFamily = familyUser?.familyId && ((studentRecord?.familyId && String(studentRecord.familyId) === String(familyUser.familyId)) ||
                (resultStudent?.familyId && String(resultStudent.familyId) === String(familyUser.familyId)));
            const linkedByParentProfile = !familyUser?.familyId && familyUser?.parentProfileId && ((studentRecord?.parentProfileId && String(studentRecord.parentProfileId) === String(familyUser.parentProfileId)) ||
                (resultStudent?.parentProfileId && String(resultStudent.parentProfileId) === String(familyUser.parentProfileId)));
            if (!linkedByFamily && !linkedByParentProfile) {
                return res.status(403).json((0, response_1.createError)('Access denied'));
            }
        }
        const language = String(req.body?.lang || req.query.lang || 'en');
        const recommendation = await (0, studyRecommendationService_1.buildStudyRecommendation)({ result, language });
        res.json((0, response_1.createResponse)({
            resultId: req.params.id,
            studentName: result.student?.name ?? [result.student?.firstName, result.student?.lastName].filter(Boolean).join(' '),
            subjectName: recommendation.subjectName,
            score: recommendation.score,
            totalMarks: result.exam?.totalMarks ?? 100,
            reason: recommendation.reason,
            analysis: recommendation.analysis,
            actions: recommendation.actions,
            books: recommendation.books,
            courses: recommendation.courses,
            lessons: recommendation.lessons,
            exercises: recommendation.exercises,
            resources: recommendation.resources,
            studyPlan: recommendation.studyPlan,
            recommendations: recommendation.recommendations,
            recommendation: {
                title: recommendation.title,
                message: recommendation.message,
                reason: recommendation.reason,
                percentage: recommendation.score,
                status: recommendation.performanceBand,
                subjectName: recommendation.subjectName,
                resources: recommendation.resources.map((item) => item.title),
                studyPlan: recommendation.studyPlan,
                actions: recommendation.actions,
                analysis: recommendation.analysis,
                books: recommendation.books,
                courses: recommendation.courses,
                lessons: recommendation.lessons,
                exercises: recommendation.exercises,
                suggestedResources: recommendation.suggestedResources
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
            .populate('student', 'name firstName lastName email studentId familyId parentProfileId assignedTeacherId')
            .populate({
            path: 'exam',
            select: 'title date totalMarks examType subject class teacherId',
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
            const resultStudent = result.student ?? {};
            const linkedByFamily = familyUser?.familyId && ((studentRecord?.familyId && String(studentRecord.familyId) === String(familyUser.familyId)) ||
                (resultStudent?.familyId && String(resultStudent.familyId) === String(familyUser.familyId)));
            const linkedByParentProfile = !familyUser?.familyId && familyUser?.parentProfileId && ((studentRecord?.parentProfileId && String(studentRecord.parentProfileId) === String(familyUser.parentProfileId)) ||
                (resultStudent?.parentProfileId && String(resultStudent.parentProfileId) === String(familyUser.parentProfileId)));
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
        const mergedBody = {
            score: existing.score,
            ...req.body
        };
        const resolved = (0, examScore_1.resolveUnifiedExamScore)(mergedBody);
        const grade = (0, examScore_1.deriveExamGrade)(resolved.score);
        const updated = await Result_1.Result.findByIdAndUpdate(req.params.id, {
            $set: {
                score: resolved.score,
                grade,
                ...(req.body.remarks !== undefined ? { remarks: req.body.remarks } : {}),
                gradedBy: req.user?.userId ?? null
            },
            $unset: {
                classroomActivityScore: 1,
                attendanceScore: 1,
                midtermScore: 1,
                finalExamScore: 1
            }
        }, { new: true })
            .populate('student', 'name firstName lastName email studentId assignedTeacherId familyId parentProfileId')
            .populate({
            path: 'exam',
            select: 'title date totalMarks examType subject class teacherId',
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

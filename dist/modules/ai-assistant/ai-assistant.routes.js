"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiAssistantRouter = void 0;
const express_1 = require("express");
const joi_1 = __importDefault(require("joi"));
const auth_1 = require("../../middlewares/auth");
const rbac_1 = require("../../middlewares/rbac");
const validate_1 = require("../../middlewares/validate");
const response_1 = require("../../helpers/response");
const Student_1 = require("../../models/Student");
const User_1 = require("../../models/User");
const Class_1 = require("../../models/Class");
const Subject_1 = require("../../models/Subject");
const Attendance_1 = require("../../models/Attendance");
const Result_1 = require("../../models/Result");
const Curriculum_1 = require("../../models/Curriculum");
const router = (0, express_1.Router)();
const useAssistant = (0, rbac_1.requireRole)('super_admin', 'admin', 'branch_manager', 'teacher', 'owner', 'system_automation');
const generateSchema = joi_1.default.object({
    body: joi_1.default.object({
        task: joi_1.default.string().valid('lesson_plan', 'assessment', 'student_support', 'school_improvement', 'policy', 'custom').required(),
        prompt: joi_1.default.string().trim().allow('', null).optional(),
        classId: joi_1.default.string().hex().length(24).allow('', null).optional(),
        subjectId: joi_1.default.string().hex().length(24).allow('', null).optional(),
        tone: joi_1.default.string().valid('professional', 'friendly', 'formal').optional(),
        lang: joi_1.default.string().valid('en', 'fa', 'ps').optional()
    })
});
function splitLines(text) {
    return String(text || '')
        .split(/\r?\n|،|,|;/)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 8);
}
function buildPlan(task, prompt, context, language = 'en') {
    const localized = {
        en: {
            defaultFocus: 'Improve learning quality and operational consistency across Nokta Academy.',
            objectives: ['Define measurable learning outcomes', 'Connect instruction with assessment evidence', 'Support students who need remediation or enrichment'],
            workflow: ['Monday: review dashboard evidence and define priorities.', 'Tuesday-Wednesday: deliver instruction/intervention and collect evidence.', 'Thursday: check mastery, attendance, and support needs.', 'Friday: publish updates, family notes, and next-week improvements.'],
            checklist: ['Clear outcome', 'Evidence source', 'Responsible role', 'Student support path', 'Review date']
        },
        fa: {
            defaultFocus: 'بهبود کیفیت یادگیری و هماهنگی عملیاتی در Nokta Academy.',
            objectives: ['نتایج یادگیری قابل سنجش را تعیین کنید', 'تدریس را با شواهد ارزیابی وصل کنید', 'از شاگردان نیازمند تقویت یا پیشرفت بیشتر حمایت کنید'],
            workflow: ['دوشنبه: شواهد داشبورد را بررسی و اولویت‌ها را تعیین کنید.', 'سه‌شنبه تا چهارشنبه: تدریس یا مداخله را اجرا و شواهد جمع‌آوری کنید.', 'پنجشنبه: تسلط، حاضری و نیازهای حمایتی را بررسی کنید.', 'جمعه: به‌روزرسانی‌ها، یادداشت‌های خانواده و اصلاحات هفته بعد را نشر کنید.'],
            checklist: ['نتیجه روشن', 'منبع شواهد', 'نقش مسئول', 'مسیر حمایت شاگرد', 'تاریخ بازبینی']
        },
        ps: {
            defaultFocus: 'په Nokta Academy کې د زده‌کړې کیفیت او عملیاتي همغږي ښه کول.',
            objectives: ['د اندازه کېدونکي زده‌کړې پایلې وټاکئ', 'تدریس له ارزونې شواهدو سره وتړئ', 'هغو زده کوونکو سره مرسته وکړئ چې ملاتړ یا پرمختګ ته اړتیا لري'],
            workflow: ['دوشنبه: د ډشبورډ شواهد وګورئ او لومړیتوبونه وټاکئ.', 'سه‌شنبه-چهارشنبه: تدریس یا ملاتړ ترسره او شواهد راټول کړئ.', 'پنجشنبه: پوهه، حاضري او ملاتړ اړتیاوې وګورئ.', 'جمعه: تازه معلومات، کورنۍ یادښتونه او د راتلونکې اونۍ اصلاحات خپاره کړئ.'],
            checklist: ['روښانه پایله', 'د شواهدو سرچینه', 'مسئول رول', 'د زده کوونکي ملاتړ لاره', 'د بیاکتنې نېټه']
        }
    };
    const text = localized[language] ?? localized.en;
    const objectives = splitLines(prompt);
    const baseObjectives = objectives.length ? objectives : text.objectives;
    const recommendationsByTask = {
        lesson_plan: [
            'Start every lesson with a 5-minute retrieval activity linked to the previous class.',
            'Use one direct instruction block, one guided practice block, and one independent check.',
            'Close with an exit ticket that maps directly to the learning outcome.'
        ],
        assessment: [
            'Use a balanced blueprint: knowledge, application, reasoning, and communication.',
            'Add clear rubrics before publishing assignments or exams.',
            'Review item difficulty after grading and reteach outcomes below 70% mastery.'
        ],
        student_support: [
            'Group learners by evidence: attendance risk, low result trend, and unpaid-fee stress signals.',
            'Create two-week intervention cycles with a named responsible teacher.',
            'Share concise progress notes with families after each cycle.'
        ],
        school_improvement: [
            'Track attendance, result mastery, finance health, and curriculum coverage weekly.',
            'Hold a short academic quality meeting every two weeks using dashboard evidence.',
            'Align teacher workload with class size and subject demand.'
        ],
        policy: [
            'Document the rule, owner, review cadence, escalation path, and audit evidence.',
            'Apply policies consistently across branches while preserving role-based approvals.',
            'Review exceptions monthly and convert repeated exceptions into updated rules.'
        ],
        custom: [
            'Turn the request into measurable goals, responsible roles, and review dates.',
            'Use existing school data before making operational changes.',
            'Pilot the change in one class or branch before scaling.'
        ]
    };
    return {
        title: task.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()),
        executiveSummary: prompt || text.defaultFocus,
        contextSnapshot: context,
        objectives: baseObjectives,
        recommendedActions: recommendationsByTask[task] ?? recommendationsByTask.custom,
        weeklyWorkflow: text.workflow,
        qualityChecklist: text.checklist
    };
}
router.use(auth_1.authenticate, useAssistant);
router.get('/insights', async (_req, res, next) => {
    try {
        const [students, teachers, classes, subjects, curricula, attendanceRisk, results] = await Promise.all([
            Student_1.Student.countDocuments({ isDeleted: false }),
            User_1.User.countDocuments({ role: 'teacher', isDeleted: false }),
            Class_1.ClassModel.countDocuments({ isDeleted: false }),
            Subject_1.Subject.countDocuments({ isDeleted: false }),
            Curriculum_1.Curriculum.countDocuments({ isDeleted: false }),
            Attendance_1.Attendance.countDocuments({ isDeleted: false, status: { $in: ['absent', 'late'] } }),
            Result_1.Result.find({ isDeleted: false }).select('score').limit(200).lean()
        ]);
        const averageScore = results.length
            ? Math.round(results.reduce((sum, result) => sum + Number(result.score || 0), 0) / results.length)
            : 0;
        res.json((0, response_1.createResponse)({
            metrics: { students, teachers, classes, subjects, curricula, attendanceRisk, averageScore },
            insights: [
                curricula < subjects ? 'Some subjects do not yet have a documented curriculum plan.' : 'Curriculum coverage is documented for the current subject catalog.',
                attendanceRisk > 0 ? 'Attendance exceptions should be reviewed before they become performance issues.' : 'Attendance risk is currently low in the sampled records.',
                averageScore && averageScore < 70 ? 'Assessment mastery is below the recommended threshold; add remediation cycles.' : 'Assessment trend is within the healthy range or still awaiting enough data.'
            ]
        }));
    }
    catch (error) {
        next(error);
    }
});
router.post('/generate', (0, validate_1.validate)(generateSchema), async (req, res) => {
    try {
        const context = {};
        if (req.body.classId) {
            const klass = await Class_1.ClassModel.findById(req.body.classId).select('className name classCode').lean();
            context.className = klass?.className ?? klass?.name ?? '';
            context.classCode = klass?.classCode ?? '';
        }
        if (req.body.subjectId) {
            const subject = await Subject_1.Subject.findById(req.body.subjectId).select('title code').lean();
            context.subjectName = subject?.title ?? '';
            context.subjectCode = subject?.code ?? '';
        }
        const plan = buildPlan(req.body.task, String(req.body.prompt || '').trim(), context, req.body.lang || 'en');
        res.json((0, response_1.createResponse)(plan, 'AI recommendation generated successfully'));
    }
    catch (error) {
        res.status(400).json((0, response_1.createError)(error?.message || 'Unable to generate recommendation'));
    }
});
exports.aiAssistantRouter = router;

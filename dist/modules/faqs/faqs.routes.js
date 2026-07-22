"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.faqAdminRouter = exports.faqPublicRouter = void 0;
const express_1 = require("express");
const joi_1 = __importDefault(require("joi"));
const Faq_1 = require("../../models/Faq");
const validate_1 = require("../../middlewares/validate");
const response_1 = require("../../helpers/response");
const inputSecurity_1 = require("../../utils/inputSecurity");
const faqPublicRouter = (0, express_1.Router)();
exports.faqPublicRouter = faqPublicRouter;
const faqAdminRouter = (0, express_1.Router)();
exports.faqAdminRouter = faqAdminRouter;
const categories = [
    'account',
    'auth',
    'classes',
    'attendance',
    'results',
    'payments',
    'books',
    'messages',
    'settings',
    'support',
    'technical'
];
const localizedSchema = joi_1.default.object({
    en: joi_1.default.string().trim().max(2000).allow('', null).optional(),
    fa: joi_1.default.string().trim().max(2000).allow('', null).optional(),
    ps: joi_1.default.string().trim().max(2000).allow('', null).optional()
});
const faqQuerySchema = joi_1.default.object({
    query: joi_1.default.object({
        category: joi_1.default.string().valid(...categories).allow('', null).optional(),
        role: joi_1.default.string().trim().max(40).allow('', null).optional(),
        search: joi_1.default.string().trim().max(120).allow('', null).optional()
    })
});
const faqCreateSchema = joi_1.default.object({
    body: joi_1.default.object({
        category: joi_1.default.string().valid(...categories).required(),
        question: localizedSchema.required(),
        answer: localizedSchema.required(),
        roles: joi_1.default.array().items(joi_1.default.string().trim().max(40)).default([]),
        tags: joi_1.default.array().items(joi_1.default.string().trim().max(80)).default([]),
        sortOrder: joi_1.default.number().integer().min(0).max(10000).default(100),
        isActive: joi_1.default.boolean().default(true)
    })
});
const faqUpdateSchema = joi_1.default.object({
    params: joi_1.default.object({
        id: joi_1.default.string().hex().length(24).required()
    }),
    body: joi_1.default.object({
        category: joi_1.default.string().valid(...categories).optional(),
        question: localizedSchema.optional(),
        answer: localizedSchema.optional(),
        roles: joi_1.default.array().items(joi_1.default.string().trim().max(40)).optional(),
        tags: joi_1.default.array().items(joi_1.default.string().trim().max(80)).optional(),
        sortOrder: joi_1.default.number().integer().min(0).max(10000).optional(),
        isActive: joi_1.default.boolean().optional()
    })
});
const idParamsSchema = joi_1.default.object({
    params: joi_1.default.object({
        id: joi_1.default.string().hex().length(24).required()
    })
});
const defaultFaqs = [
    {
        category: 'account',
        sortOrder: 10,
        tags: ['profile', 'password', 'session'],
        question: {
            en: 'How do I update my profile information?',
            fa: 'چطور معلومات پروفایل خود را تازه کنم؟',
            ps: 'د خپل پروفایل معلومات څنګه تازه کړم؟'
        },
        answer: {
            en: 'Open Settings, choose Edit Profile, and update the fields your role is allowed to change. Profile photos can be selected from your phone gallery or files.',
            fa: 'تنظیمات را باز کنید، ویرایش پروفایل را انتخاب کنید و فیلدهایی را تازه کنید که برای نقش شما اجازه داده شده است. تصویر پروفایل را می‌توانید از گالری یا فایل‌های تیلفون انتخاب کنید.',
            ps: 'تنظیمات پرانیزئ، د پروفایل سمون وټاکئ او هغه برخې تازه کړئ چې ستاسو رول ته اجازه لري. د پروفایل انځور له ګالري یا فایلونو څخه ټاکل کېدای شي.'
        }
    },
    {
        category: 'auth',
        sortOrder: 20,
        tags: ['login', 'register'],
        question: {
            en: 'What should I do if I cannot sign in?',
            fa: 'اگر وارد حساب شده نتوانم چه کنم؟',
            ps: 'که حساب ته ننوتلای نه شم څه وکړم؟'
        },
        answer: {
            en: 'Check your email or phone and password, then try again. If the problem continues, send a support request from Contact Support so the academy can review your account.',
            fa: 'ایمیل یا شماره تیلفون و رمز خود را بررسی کنید و دوباره کوشش کنید. اگر مشکل ادامه داشت، از بخش تماس با پشتیبانی درخواست بفرستید تا اکادمی حساب شما را بررسی کند.',
            ps: 'خپل برېښنالیک یا تیلیفون او پټنوم وګورئ او بیا هڅه وکړئ. که ستونزه پاتې وه، د ملاتړ اړیکې له لارې غوښتنه ولېږئ څو اکاډمي ستاسو حساب وګوري.'
        }
    },
    {
        category: 'classes',
        sortOrder: 30,
        tags: ['classes', 'courses', 'enrollment'],
        question: {
            en: 'Why do I only see some classes or courses?',
            fa: 'چرا فقط بعضی صنف‌ها یا کورس‌ها را می‌بینم؟',
            ps: 'ولې یوازې ځینې ټولګي یا کورسونه وینم؟'
        },
        answer: {
            en: 'Student pages show only records linked to your enrollment. If a class or course is missing, contact your teacher or academy office to check the enrollment record.',
            fa: 'صفحات شاگرد فقط رکوردهایی را نشان می‌دهد که به ثبت‌نام شما وصل است. اگر صنف یا کورس دیده نمی‌شود، با استاد یا دفتر اکادمی تماس بگیرید تا ثبت‌نام بررسی شود.',
            ps: 'د زده کوونکي پاڼې یوازې هغه ریکارډونه ښيي چې ستاسو نوملیکنې سره تړلي وي. که ټولګی یا کورس نشته، له ښوونکي یا د اکاډمۍ دفتر سره اړیکه ونیسئ.'
        }
    },
    {
        category: 'attendance',
        sortOrder: 40,
        tags: ['attendance', 'teacher'],
        question: {
            en: 'Where does my attendance record come from?',
            fa: 'ریکارد حاضری من از کجا می‌آید؟',
            ps: 'زما د حاضرۍ ریکارډ له کومه راځي؟'
        },
        answer: {
            en: 'Attendance records are saved by your teacher or academy administration. Refresh the Attendance page to load the latest saved records.',
            fa: 'ریکاردهای حاضری توسط استاد یا اداره اکادمی ثبت می‌شود. صفحه حاضری را تازه کنید تا آخرین ریکاردها بارگذاری شود.',
            ps: 'د حاضرۍ ریکارډونه ستاسو ښوونکی یا د اکاډمۍ اداره ثبتوي. د حاضرۍ پاڼه تازه کړئ څو وروستي ریکارډونه راشي.'
        }
    },
    {
        category: 'support',
        sortOrder: 50,
        tags: ['support', 'message', 'ticket'],
        question: {
            en: 'How do I contact support from the mobile app?',
            fa: 'چطور از اپ موبایل با پشتیبانی تماس بگیرم؟',
            ps: 'له موبایل اپ څخه ملاتړ سره څنګه اړیکه ونیسم؟'
        },
        answer: {
            en: 'Open Help or Contact Support, write your request, and submit it. Your request is stored as a support message for the academy team.',
            fa: 'کمک یا تماس با پشتیبانی را باز کنید، درخواست خود را بنویسید و ارسال کنید. درخواست شما به‌عنوان پیام پشتیبانی برای تیم اکادمی ثبت می‌شود.',
            ps: 'مرسته یا د ملاتړ اړیکه پرانیزئ، خپله غوښتنه ولیکئ او ولېږئ. غوښتنه مو د اکاډمۍ ټیم لپاره د ملاتړ پیغام په توګه خوندي کېږي.'
        }
    }
];
function serializeFaq(item) {
    return {
        id: String(item._id),
        category: item.category,
        question: item.question ?? {},
        answer: item.answer ?? {},
        roles: item.roles ?? [],
        tags: item.tags ?? [],
        sortOrder: item.sortOrder ?? 100,
        isActive: item.isActive !== false,
        updatedAt: item.updatedAt ?? null
    };
}
async function ensureDefaultFaqs() {
    const existing = await Faq_1.Faq.countDocuments({ isDeleted: false });
    if (existing > 0)
        return;
    await Faq_1.Faq.insertMany(defaultFaqs.map((item) => ({ ...item, isActive: true })));
}
function buildPublicFilter(query) {
    const filter = { isDeleted: false, isActive: true };
    if (query.category)
        filter.category = query.category;
    if (query.role)
        filter.$or = [{ roles: { $size: 0 } }, { roles: query.role }];
    if (query.search) {
        const search = (0, inputSecurity_1.sanitizePlainText)(query.search, 120);
        filter.$and = [
            ...(Array.isArray(filter.$and) ? filter.$and : []),
            {
                $or: [
                    { 'question.en': { $regex: search, $options: 'i' } },
                    { 'question.fa': { $regex: search, $options: 'i' } },
                    { 'question.ps': { $regex: search, $options: 'i' } },
                    { 'answer.en': { $regex: search, $options: 'i' } },
                    { 'answer.fa': { $regex: search, $options: 'i' } },
                    { 'answer.ps': { $regex: search, $options: 'i' } },
                    { tags: { $regex: search, $options: 'i' } }
                ]
            }
        ];
    }
    return filter;
}
faqPublicRouter.get('/', (0, validate_1.validate)(faqQuerySchema), async (req, res, next) => {
    try {
        await ensureDefaultFaqs();
        const items = await Faq_1.Faq.find(buildPublicFilter(req.query))
            .sort({ sortOrder: 1, createdAt: 1 })
            .lean();
        res.json((0, response_1.createResponse)(items.map(serializeFaq)));
    }
    catch (error) {
        next(error);
    }
});
faqAdminRouter.get('/', (0, validate_1.validate)(faqQuerySchema), async (req, res, next) => {
    try {
        await ensureDefaultFaqs();
        const role = req.user?.canonicalRole ?? req.user?.role;
        if (!['super_admin', 'admin', 'branch_manager', 'owner'].includes(String(role))) {
            return res.status(403).json((0, response_1.createError)('Forbidden'));
        }
        const items = await Faq_1.Faq.find({ isDeleted: false })
            .sort({ sortOrder: 1, createdAt: 1 })
            .lean();
        res.json((0, response_1.createResponse)(items.map(serializeFaq)));
    }
    catch (error) {
        next(error);
    }
});
faqAdminRouter.post('/', (0, validate_1.validate)(faqCreateSchema), async (req, res, next) => {
    try {
        const role = req.user?.canonicalRole ?? req.user?.role;
        if (!['super_admin', 'admin', 'branch_manager', 'owner'].includes(String(role))) {
            return res.status(403).json((0, response_1.createError)('Forbidden'));
        }
        const item = await Faq_1.Faq.create({
            ...req.body,
            maintainedBy: req.user?.userId ?? null
        });
        res.status(201).json((0, response_1.createResponse)(serializeFaq(item.toObject()), 'FAQ created'));
    }
    catch (error) {
        next(error);
    }
});
faqAdminRouter.put('/:id', (0, validate_1.validate)(faqUpdateSchema), async (req, res, next) => {
    try {
        const role = req.user?.canonicalRole ?? req.user?.role;
        if (!['super_admin', 'admin', 'branch_manager', 'owner'].includes(String(role))) {
            return res.status(403).json((0, response_1.createError)('Forbidden'));
        }
        const item = await Faq_1.Faq.findOneAndUpdate({ _id: req.params.id, isDeleted: false }, { ...req.body, maintainedBy: req.user?.userId ?? null }, { new: true }).lean();
        if (!item)
            return res.status(404).json((0, response_1.createError)('FAQ not found'));
        res.json((0, response_1.createResponse)(serializeFaq(item), 'FAQ updated'));
    }
    catch (error) {
        next(error);
    }
});
faqAdminRouter.delete('/:id', (0, validate_1.validate)(idParamsSchema), async (req, res, next) => {
    try {
        const role = req.user?.canonicalRole ?? req.user?.role;
        if (!['super_admin', 'admin', 'branch_manager', 'owner'].includes(String(role))) {
            return res.status(403).json((0, response_1.createError)('Forbidden'));
        }
        const item = await Faq_1.Faq.findOneAndUpdate({ _id: req.params.id, isDeleted: false }, { isDeleted: true, deletedAt: new Date(), deletedBy: req.user?.userId ?? null }, { new: true }).lean();
        if (!item)
            return res.status(404).json((0, response_1.createError)('FAQ not found'));
        res.json((0, response_1.createResponse)({ id: req.params.id }, 'FAQ deleted'));
    }
    catch (error) {
        next(error);
    }
});

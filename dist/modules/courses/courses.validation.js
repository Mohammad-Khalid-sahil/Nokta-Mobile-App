"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.courseQuerySchema = exports.idParamsSchema = exports.updateCourseSchema = exports.createCourseSchema = void 0;
const joi_1 = __importDefault(require("joi"));
const localizedText = joi_1.default.alternatives().try(joi_1.default.string().trim().allow('', null), joi_1.default.object({
    en: joi_1.default.string().trim().allow('', null).optional(),
    fa: joi_1.default.string().trim().allow('', null).optional(),
    ps: joi_1.default.string().trim().allow('', null).optional()
}));
const coursePayload = {
    title: localizedText.required(),
    slug: joi_1.default.string().trim().lowercase().pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).required(),
    description: localizedText.optional(),
    duration: joi_1.default.string().trim().allow('', null).optional(),
    fee: joi_1.default.number().min(0).optional(),
    instructor: joi_1.default.string().hex().length(24).allow('', null).optional(),
    teacher: joi_1.default.string().hex().length(24).allow('', null).optional(),
    subjects: joi_1.default.alternatives().try(joi_1.default.array().items(joi_1.default.string().hex().length(24)), joi_1.default.string().allow('', null)).optional(),
    schedule: joi_1.default.string().trim().allow('', null).optional(),
    capacity: joi_1.default.number().integer().min(0).optional(),
    enrolledCount: joi_1.default.number().integer().min(0).optional(),
    enrollmentStatus: joi_1.default.string().valid('open', 'closed', 'waitlist').optional(),
    imageUrl: joi_1.default.string().trim().allow('', null).optional(),
    academicCategory: joi_1.default.string().trim().allow('', null).optional(),
    category: joi_1.default.string().trim().allow('', null).optional(),
    startDate: joi_1.default.date().allow(null).optional(),
    endDate: joi_1.default.date().allow(null).optional(),
    requirements: localizedText.optional(),
    learningOutcomes: localizedText.optional(),
    language: joi_1.default.string().valid('en', 'fa', 'ps', 'multilingual').optional(),
    visibility: joi_1.default.string().valid('public', 'private').optional(),
    status: joi_1.default.string().valid('draft', 'active', 'archived').optional(),
    featured: joi_1.default.boolean().optional(),
    branchId: joi_1.default.string().hex().length(24).allow('', null).optional(),
    branch: joi_1.default.string().hex().length(24).allow('', null).optional()
};
exports.createCourseSchema = joi_1.default.object({ body: joi_1.default.object(coursePayload) });
exports.updateCourseSchema = joi_1.default.object({
    params: joi_1.default.object({ id: joi_1.default.string().hex().length(24).required() }),
    body: joi_1.default.object({ ...coursePayload, title: localizedText.optional(), slug: coursePayload.slug.optional() }).min(1)
});
exports.idParamsSchema = joi_1.default.object({ params: joi_1.default.object({ id: joi_1.default.string().hex().length(24).required() }) });
exports.courseQuerySchema = joi_1.default.object({
    query: joi_1.default.object({
        page: joi_1.default.number().integer().min(1).default(1),
        limit: joi_1.default.number().integer().min(1).max(100).default(20),
        search: joi_1.default.string().allow('', null).optional(),
        status: joi_1.default.string().valid('draft', 'active', 'archived').optional(),
        visibility: joi_1.default.string().valid('public', 'private').optional(),
        category: joi_1.default.string().allow('', null).optional(),
        featured: joi_1.default.boolean().optional(),
        sortBy: joi_1.default.string().valid('createdAt', 'title', 'fee', 'startDate', 'featured').optional(),
        sortOrder: joi_1.default.string().valid('asc', 'desc').optional(),
        lang: joi_1.default.string().valid('en', 'fa', 'ps').optional()
    })
});

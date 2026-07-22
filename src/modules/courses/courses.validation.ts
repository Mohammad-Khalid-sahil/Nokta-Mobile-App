import Joi from 'joi';

const localizedText = Joi.alternatives().try(
  Joi.string().trim().allow('', null),
  Joi.object({
    en: Joi.string().trim().allow('', null).optional(),
    fa: Joi.string().trim().allow('', null).optional(),
    ps: Joi.string().trim().allow('', null).optional()
  })
);

const coursePayload = {
  title: localizedText.required(),
  slug: Joi.string().trim().lowercase().pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).required(),
  description: localizedText.optional(),
  duration: Joi.string().trim().allow('', null).optional(),
  fee: Joi.number().min(0).optional(),
  instructor: Joi.string().hex().length(24).allow('', null).optional(),
  teacher: Joi.string().hex().length(24).allow('', null).optional(),
  subjects: Joi.alternatives().try(Joi.array().items(Joi.string().hex().length(24)), Joi.string().allow('', null)).optional(),
  schedule: Joi.string().trim().allow('', null).optional(),
  capacity: Joi.number().integer().min(0).optional(),
  enrolledCount: Joi.number().integer().min(0).optional(),
  enrollmentStatus: Joi.string().valid('open', 'closed', 'waitlist').optional(),
  imageUrl: Joi.string().trim().allow('', null).optional(),
  academicCategory: Joi.string().trim().allow('', null).optional(),
  category: Joi.string().trim().allow('', null).optional(),
  startDate: Joi.date().allow(null).optional(),
  endDate: Joi.date().allow(null).optional(),
  requirements: localizedText.optional(),
  learningOutcomes: localizedText.optional(),
  language: Joi.string().valid('en', 'fa', 'ps', 'multilingual').optional(),
  visibility: Joi.string().valid('public', 'private').optional(),
  status: Joi.string().valid('draft', 'active', 'archived').optional(),
  featured: Joi.boolean().optional(),
  branchId: Joi.string().hex().length(24).allow('', null).optional(),
  branch: Joi.string().hex().length(24).allow('', null).optional()
};

export const createCourseSchema = Joi.object({ body: Joi.object(coursePayload) });

export const updateCourseSchema = Joi.object({
  params: Joi.object({ id: Joi.string().hex().length(24).required() }),
  body: Joi.object({ ...coursePayload, title: localizedText.optional(), slug: coursePayload.slug.optional() }).min(1)
});

export const idParamsSchema = Joi.object({ params: Joi.object({ id: Joi.string().hex().length(24).required() }) });

export const courseQuerySchema = Joi.object({
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    search: Joi.string().allow('', null).optional(),
    status: Joi.string().valid('draft', 'active', 'archived').optional(),
    visibility: Joi.string().valid('public', 'private').optional(),
    category: Joi.string().allow('', null).optional(),
    featured: Joi.boolean().optional(),
    sortBy: Joi.string().valid('createdAt', 'title', 'fee', 'startDate', 'featured').optional(),
    sortOrder: Joi.string().valid('asc', 'desc').optional(),
    lang: Joi.string().valid('en', 'fa', 'ps').optional()
  })
});

import { Router } from 'express';
import Joi from 'joi';
import { validate } from '../../middlewares/validate';
import { createResponse } from '../../helpers/response';
import { listPublicAnnouncements } from '../../services/publicAnnouncementsService';

const router = Router();

const querySchema = Joi.object({
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    search: Joi.string().allow('', null).optional(),
    lang: Joi.string().valid('en', 'fa', 'ps').optional()
  })
});

router.get('/', validate(querySchema), async (req, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    const search = String(req.query.search || '').trim();
    const lang = String(req.query.lang || 'en');
    const result = await listPublicAnnouncements({ page, limit, search, lang });
    res.json(createResponse(result.items, '', {
      page: result.page,
      limit: result.limit,
      total: result.total
    }));
  } catch (error) {
    next(error);
  }
});

export const publicAnnouncementsRouter = router;

import { Router } from 'express';
import Joi from 'joi';
import { LegalDocument } from '../../models/LegalDocument';
import { validate } from '../../middlewares/validate';
import { createError, createResponse } from '../../helpers/response';
import { sanitizePlainText } from '../../utils/inputSecurity';

const legalDocumentsPublicRouter = Router();
const legalDocumentsAdminRouter = Router();

const legalDocumentKeys = [
  'privacy_policy',
  'terms_conditions',
  'data_account_policy'
] as const;

const defaultLegalDocuments = [
  {
    key: 'privacy_policy',
    title: {
      en: 'Privacy Policy',
      fa: 'پالیسی محرمیت',
      ps: 'د محرمیت پالیسي'
    },
    description: {
      en: 'How academy data is handled.',
      fa: 'چگونگی رسیدگی به معلومات اکادمی.',
      ps: 'د اکادمۍ معلومات څنګه اداره کېږي.'
    }
  },
  {
    key: 'terms_conditions',
    title: {
      en: 'Terms and Conditions',
      fa: 'شرایط و مقررات',
      ps: 'شرایط او مقررات'
    },
    description: {
      en: 'Rules for using the academy platform.',
      fa: 'قواعد استفاده از پلتفرم اکادمی.',
      ps: 'د اکادمۍ د سیستم د کارولو اصول.'
    }
  },
  {
    key: 'data_account_policy',
    title: {
      en: 'Data and Account Policy',
      fa: 'پالیسی معلومات و حساب',
      ps: 'د معلوماتو او حساب پالیسي'
    },
    description: {
      en: 'Account, data access, and support responsibilities.',
      fa: 'مسوولیت‌های حساب، دسترسی به معلومات و پشتیبانی.',
      ps: 'د حساب، معلوماتو لاسرسي او ملاتړ مسوولیتونه.'
    }
  }
];

const localizedSchema = Joi.object({
  en: Joi.string().trim().max(20000).allow('', null).optional(),
  fa: Joi.string().trim().max(20000).allow('', null).optional(),
  ps: Joi.string().trim().max(20000).allow('', null).optional()
});

const updateSchema = Joi.object({
  params: Joi.object({
    key: Joi.string()
      .valid(...legalDocumentKeys)
      .required()
  }),
  body: Joi.object({
    title: localizedSchema.optional(),
    description: localizedSchema.optional(),
    content: localizedSchema.optional(),
    version: Joi.string().trim().max(40).allow('', null).optional(),
    lastUpdatedAt: Joi.date().allow(null).optional(),
    isPublished: Joi.boolean().optional()
  })
});

function cleanText(value: unknown, max = 20000) {
  return sanitizePlainText(String(value ?? '').trim(), max);
}

function cleanLocalized(value: any, max = 20000) {
  return {
    en: cleanText(value?.en, max),
    fa: cleanText(value?.fa, max),
    ps: cleanText(value?.ps, max)
  };
}

function serializeLegalDocument(item: any) {
  return {
    key: item?.key ?? '',
    title: item?.title ?? { en: '', fa: '', ps: '' },
    description: item?.description ?? { en: '', fa: '', ps: '' },
    content: item?.content ?? { en: '', fa: '', ps: '' },
    version: item?.version ?? '1.0',
    lastUpdatedAt: item?.lastUpdatedAt ?? item?.updatedAt ?? null,
    isPublished: Boolean(item?.isPublished),
    updatedAt: item?.updatedAt ?? null
  };
}

async function ensureDefaultLegalDocuments() {
  for (const item of defaultLegalDocuments) {
    await LegalDocument.findOneAndUpdate(
      { key: item.key, isDeleted: false },
      {
        $setOnInsert: {
          ...item,
          content: { en: '', fa: '', ps: '' },
          version: '1.0',
          isPublished: false
        }
      },
      { upsert: true, new: true }
    );
  }
}

async function listLegalDocuments(includeUnpublished = false) {
  await ensureDefaultLegalDocuments();
  const query: Record<string, unknown> = { isDeleted: false };
  if (!includeUnpublished) query.isPublished = true;
  const docs = await LegalDocument.find(query).sort({ key: 1 }).lean();
  return docs.map(serializeLegalDocument);
}

function canManageLegalDocuments(req: any) {
  const role = req.user?.canonicalRole ?? req.user?.role;
  return ['super_admin', 'admin', 'branch_manager', 'owner'].includes(String(role));
}

legalDocumentsPublicRouter.get('/', async (req, res, next) => {
  try {
    const includeDrafts = req.query.includeDrafts === 'true' && canManageLegalDocuments(req);
    const documents = await listLegalDocuments(includeDrafts);
    res.json(createResponse({ items: documents }));
  } catch (error) {
    next(error);
  }
});

legalDocumentsPublicRouter.get('/:key', async (req, res, next) => {
  try {
    await ensureDefaultLegalDocuments();
    const document = await LegalDocument.findOne({
      key: req.params.key,
      isDeleted: false,
      isPublished: true
    }).lean();
    if (!document) {
      return res.status(404).json(createError('Legal document not published'));
    }
    res.json(createResponse(serializeLegalDocument(document)));
  } catch (error) {
    next(error);
  }
});

legalDocumentsAdminRouter.get('/', async (req, res, next) => {
  try {
    if (!canManageLegalDocuments(req)) {
      return res.status(403).json(createError('Forbidden'));
    }
    const documents = await listLegalDocuments(true);
    res.json(createResponse({ items: documents }));
  } catch (error) {
    next(error);
  }
});

legalDocumentsAdminRouter.put('/:key', validate(updateSchema), async (req, res, next) => {
  try {
    if (!canManageLegalDocuments(req)) {
      return res.status(403).json(createError('Forbidden'));
    }

    const body = req.body;
    const payload: Record<string, unknown> = {
      title: cleanLocalized(body.title, 500),
      description: cleanLocalized(body.description, 1000),
      content: cleanLocalized(body.content, 20000),
      version: cleanText(body.version, 40) || '1.0',
      lastUpdatedAt: body.lastUpdatedAt ? new Date(body.lastUpdatedAt) : new Date(),
      isPublished: Boolean(body.isPublished),
      updatedBy: req.user?.userId ?? null
    };

    const document = await LegalDocument.findOneAndUpdate(
      { key: req.params.key, isDeleted: false },
      { $set: payload, $setOnInsert: { key: req.params.key } },
      { upsert: true, new: true, runValidators: true }
    ).lean();
    res.json(createResponse(serializeLegalDocument(document), 'Legal document updated'));
  } catch (error) {
    next(error);
  }
});

export { legalDocumentsPublicRouter, legalDocumentsAdminRouter };

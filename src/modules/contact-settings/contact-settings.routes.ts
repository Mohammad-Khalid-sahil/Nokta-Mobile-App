import { Router } from 'express';
import Joi from 'joi';
import { ContactSetting } from '../../models/ContactSetting';
import { validate } from '../../middlewares/validate';
import { createError, createResponse } from '../../helpers/response';
import { sanitizePlainText } from '../../utils/inputSecurity';
import {
  ACADEMY_ADDRESS,
  isStaleAcademyAddress,
  resolveAcademyAddress
} from '../../constants/academyAddress';

const contactSettingsPublicRouter = Router();
const contactSettingsAdminRouter = Router();

const localizedSchema = Joi.object({
  en: Joi.string().trim().max(500).allow('', null).optional(),
  fa: Joi.string().trim().max(500).allow('', null).optional(),
  ps: Joi.string().trim().max(500).allow('', null).optional()
});

const updateSchema = Joi.object({
  body: Joi.object({
    whatsapp: Joi.string().trim().max(300).allow('', null).optional(),
    facebook: Joi.string().trim().max(500).allow('', null).optional(),
    telegram: Joi.string().trim().max(500).allow('', null).optional(),
    instagram: Joi.string().trim().max(500).allow('', null).optional(),
    phone: Joi.string().trim().max(80).allow('', null).optional(),
    email: Joi.string().trim().max(160).allow('', null).optional(),
    address: localizedSchema.optional(),
    supportHours: localizedSchema.optional()
  })
});

const defaultContactSettings = {
  key: 'academy',
  whatsapp: '',
  facebook: '',
  telegram: '',
  instagram: '',
  phone: '',
  email: '',
  address: { ...ACADEMY_ADDRESS },
  supportHours: { en: '', fa: '', ps: '' }
};

function cleanText(value: unknown, max = 500) {
  return sanitizePlainText(String(value ?? '').trim(), max);
}

function cleanLocalized(value: any) {
  return {
    en: cleanText(value?.en, 500),
    fa: cleanText(value?.fa, 500),
    ps: cleanText(value?.ps, 500)
  };
}

function sanitizeUrl(value: unknown) {
  const text = cleanText(value, 500);
  if (!text) return '';
  try {
    const uri = new URL(text);
    return ['http:', 'https:', 'tg:'].includes(uri.protocol) ? text : '';
  } catch {
    return text.startsWith('@') ? text : text;
  }
}

function serializeContactSettings(item: any) {
  return {
    whatsapp: item?.whatsapp ?? '',
    facebook: item?.facebook ?? '',
    telegram: item?.telegram ?? '',
    instagram: item?.instagram ?? '',
    phone: item?.phone ?? '',
    email: item?.email ?? '',
    address: resolveAcademyAddress(item?.address),
    supportHours: item?.supportHours ?? { en: '', fa: '', ps: '' },
    updatedAt: item?.updatedAt ?? null
  };
}

function addressNeedsBackfill(address: unknown) {
  const resolved = resolveAcademyAddress(address);
  const source =
    address && typeof address === 'object' && !Array.isArray(address)
      ? (address as Record<string, unknown>)
      : {};
  return (
    isStaleAcademyAddress(source.en) ||
    isStaleAcademyAddress(source.fa) ||
    isStaleAcademyAddress(source.ps) ||
    String(source.en ?? '').trim() !== resolved.en ||
    String(source.fa ?? '').trim() !== resolved.fa ||
    String(source.ps ?? '').trim() !== resolved.ps
  );
}

async function getOrCreateContactSettings() {
  const existing = await ContactSetting.findOne({
    key: 'academy',
    isDeleted: false
  }).lean();
  if (!existing) {
    return ContactSetting.create(defaultContactSettings);
  }

  if (addressNeedsBackfill(existing.address)) {
    const address = resolveAcademyAddress(existing.address);
    await ContactSetting.updateOne(
      { _id: existing._id },
      { $set: { address } }
    );
    return { ...existing, address };
  }

  return existing;
}

contactSettingsPublicRouter.get('/', async (_req, res, next) => {
  try {
    const item = await getOrCreateContactSettings();
    res.json(createResponse(serializeContactSettings(item)));
  } catch (error) {
    next(error);
  }
});

contactSettingsAdminRouter.get('/', async (req, res, next) => {
  try {
    const role = req.user?.canonicalRole ?? req.user?.role;
    if (!['super_admin', 'admin', 'branch_manager', 'owner'].includes(String(role))) {
      return res.status(403).json(createError('Forbidden'));
    }
    const item = await getOrCreateContactSettings();
    res.json(createResponse(serializeContactSettings(item)));
  } catch (error) {
    next(error);
  }
});

contactSettingsAdminRouter.put('/', validate(updateSchema), async (req, res, next) => {
  try {
    const role = req.user?.canonicalRole ?? req.user?.role;
    if (!['super_admin', 'admin', 'branch_manager', 'owner'].includes(String(role))) {
      return res.status(403).json(createError('Forbidden'));
    }

    const body = req.body;
    const payload: Record<string, unknown> = {
      whatsapp: cleanText(body.whatsapp, 300),
      facebook: sanitizeUrl(body.facebook),
      telegram: sanitizeUrl(body.telegram),
      instagram: sanitizeUrl(body.instagram),
      phone: cleanText(body.phone, 80),
      email: cleanText(body.email, 160).toLowerCase(),
      address: resolveAcademyAddress(cleanLocalized(body.address)),
      supportHours: cleanLocalized(body.supportHours),
      updatedBy: req.user?.userId ?? null
    };

    const item = await ContactSetting.findOneAndUpdate(
      { key: 'academy', isDeleted: false },
      { $set: payload, $setOnInsert: { key: 'academy' } },
      { new: true, upsert: true }
    ).lean();
    res.json(createResponse(serializeContactSettings(item), 'Contact settings updated'));
  } catch (error) {
    next(error);
  }
});

export { contactSettingsPublicRouter, contactSettingsAdminRouter };

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.legalDocumentsAdminRouter = exports.legalDocumentsPublicRouter = void 0;
const express_1 = require("express");
const joi_1 = __importDefault(require("joi"));
const LegalDocument_1 = require("../../models/LegalDocument");
const validate_1 = require("../../middlewares/validate");
const response_1 = require("../../helpers/response");
const inputSecurity_1 = require("../../utils/inputSecurity");
const legalDocumentsPublicRouter = (0, express_1.Router)();
exports.legalDocumentsPublicRouter = legalDocumentsPublicRouter;
const legalDocumentsAdminRouter = (0, express_1.Router)();
exports.legalDocumentsAdminRouter = legalDocumentsAdminRouter;
const legalDocumentKeys = [
    'privacy_policy',
    'terms_conditions',
    'data_account_policy'
];
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
const localizedSchema = joi_1.default.object({
    en: joi_1.default.string().trim().max(20000).allow('', null).optional(),
    fa: joi_1.default.string().trim().max(20000).allow('', null).optional(),
    ps: joi_1.default.string().trim().max(20000).allow('', null).optional()
});
const updateSchema = joi_1.default.object({
    params: joi_1.default.object({
        key: joi_1.default.string()
            .valid(...legalDocumentKeys)
            .required()
    }),
    body: joi_1.default.object({
        title: localizedSchema.optional(),
        description: localizedSchema.optional(),
        content: localizedSchema.optional(),
        version: joi_1.default.string().trim().max(40).allow('', null).optional(),
        lastUpdatedAt: joi_1.default.date().allow(null).optional(),
        isPublished: joi_1.default.boolean().optional()
    })
});
function cleanText(value, max = 20000) {
    return (0, inputSecurity_1.sanitizePlainText)(String(value ?? '').trim(), max);
}
function cleanLocalized(value, max = 20000) {
    return {
        en: cleanText(value?.en, max),
        fa: cleanText(value?.fa, max),
        ps: cleanText(value?.ps, max)
    };
}
function serializeLegalDocument(item) {
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
        await LegalDocument_1.LegalDocument.findOneAndUpdate({ key: item.key, isDeleted: false }, {
            $setOnInsert: {
                ...item,
                content: { en: '', fa: '', ps: '' },
                version: '1.0',
                isPublished: false
            }
        }, { upsert: true, new: true });
    }
}
async function listLegalDocuments(includeUnpublished = false) {
    await ensureDefaultLegalDocuments();
    const query = { isDeleted: false };
    if (!includeUnpublished)
        query.isPublished = true;
    const docs = await LegalDocument_1.LegalDocument.find(query).sort({ key: 1 }).lean();
    return docs.map(serializeLegalDocument);
}
function canManageLegalDocuments(req) {
    const role = req.user?.canonicalRole ?? req.user?.role;
    return ['super_admin', 'admin', 'branch_manager', 'owner'].includes(String(role));
}
legalDocumentsPublicRouter.get('/', async (req, res, next) => {
    try {
        const includeDrafts = req.query.includeDrafts === 'true' && canManageLegalDocuments(req);
        const documents = await listLegalDocuments(includeDrafts);
        res.json((0, response_1.createResponse)({ items: documents }));
    }
    catch (error) {
        next(error);
    }
});
legalDocumentsPublicRouter.get('/:key', async (req, res, next) => {
    try {
        await ensureDefaultLegalDocuments();
        const document = await LegalDocument_1.LegalDocument.findOne({
            key: req.params.key,
            isDeleted: false,
            isPublished: true
        }).lean();
        if (!document) {
            return res.status(404).json((0, response_1.createError)('Legal document not published'));
        }
        res.json((0, response_1.createResponse)(serializeLegalDocument(document)));
    }
    catch (error) {
        next(error);
    }
});
legalDocumentsAdminRouter.get('/', async (req, res, next) => {
    try {
        if (!canManageLegalDocuments(req)) {
            return res.status(403).json((0, response_1.createError)('Forbidden'));
        }
        const documents = await listLegalDocuments(true);
        res.json((0, response_1.createResponse)({ items: documents }));
    }
    catch (error) {
        next(error);
    }
});
legalDocumentsAdminRouter.put('/:key', (0, validate_1.validate)(updateSchema), async (req, res, next) => {
    try {
        if (!canManageLegalDocuments(req)) {
            return res.status(403).json((0, response_1.createError)('Forbidden'));
        }
        const body = req.body;
        const payload = {
            title: cleanLocalized(body.title, 500),
            description: cleanLocalized(body.description, 1000),
            content: cleanLocalized(body.content, 20000),
            version: cleanText(body.version, 40) || '1.0',
            lastUpdatedAt: body.lastUpdatedAt ? new Date(body.lastUpdatedAt) : new Date(),
            isPublished: Boolean(body.isPublished),
            updatedBy: req.user?.userId ?? null
        };
        const document = await LegalDocument_1.LegalDocument.findOneAndUpdate({ key: req.params.key, isDeleted: false }, { $set: payload, $setOnInsert: { key: req.params.key } }, { upsert: true, new: true, runValidators: true }).lean();
        res.json((0, response_1.createResponse)(serializeLegalDocument(document), 'Legal document updated'));
    }
    catch (error) {
        next(error);
    }
});

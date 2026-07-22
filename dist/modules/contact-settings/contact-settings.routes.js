"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.contactSettingsAdminRouter = exports.contactSettingsPublicRouter = void 0;
const express_1 = require("express");
const joi_1 = __importDefault(require("joi"));
const ContactSetting_1 = require("../../models/ContactSetting");
const validate_1 = require("../../middlewares/validate");
const response_1 = require("../../helpers/response");
const inputSecurity_1 = require("../../utils/inputSecurity");
const academyAddress_1 = require("../../constants/academyAddress");
const contactSettingsPublicRouter = (0, express_1.Router)();
exports.contactSettingsPublicRouter = contactSettingsPublicRouter;
const contactSettingsAdminRouter = (0, express_1.Router)();
exports.contactSettingsAdminRouter = contactSettingsAdminRouter;
const localizedSchema = joi_1.default.object({
    en: joi_1.default.string().trim().max(500).allow('', null).optional(),
    fa: joi_1.default.string().trim().max(500).allow('', null).optional(),
    ps: joi_1.default.string().trim().max(500).allow('', null).optional()
});
const updateSchema = joi_1.default.object({
    body: joi_1.default.object({
        whatsapp: joi_1.default.string().trim().max(300).allow('', null).optional(),
        facebook: joi_1.default.string().trim().max(500).allow('', null).optional(),
        telegram: joi_1.default.string().trim().max(500).allow('', null).optional(),
        instagram: joi_1.default.string().trim().max(500).allow('', null).optional(),
        phone: joi_1.default.string().trim().max(80).allow('', null).optional(),
        email: joi_1.default.string().trim().max(160).allow('', null).optional(),
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
    address: { ...academyAddress_1.ACADEMY_ADDRESS },
    supportHours: { en: '', fa: '', ps: '' }
};
function cleanText(value, max = 500) {
    return (0, inputSecurity_1.sanitizePlainText)(String(value ?? '').trim(), max);
}
function cleanLocalized(value) {
    return {
        en: cleanText(value?.en, 500),
        fa: cleanText(value?.fa, 500),
        ps: cleanText(value?.ps, 500)
    };
}
function sanitizeUrl(value) {
    const text = cleanText(value, 500);
    if (!text)
        return '';
    try {
        const uri = new URL(text);
        return ['http:', 'https:', 'tg:'].includes(uri.protocol) ? text : '';
    }
    catch {
        return text.startsWith('@') ? text : text;
    }
}
function serializeContactSettings(item) {
    return {
        whatsapp: item?.whatsapp ?? '',
        facebook: item?.facebook ?? '',
        telegram: item?.telegram ?? '',
        instagram: item?.instagram ?? '',
        phone: item?.phone ?? '',
        email: item?.email ?? '',
        address: (0, academyAddress_1.resolveAcademyAddress)(item?.address),
        supportHours: item?.supportHours ?? { en: '', fa: '', ps: '' },
        updatedAt: item?.updatedAt ?? null
    };
}
function addressNeedsBackfill(address) {
    const resolved = (0, academyAddress_1.resolveAcademyAddress)(address);
    const source = address && typeof address === 'object' && !Array.isArray(address)
        ? address
        : {};
    return ((0, academyAddress_1.isStaleAcademyAddress)(source.en) ||
        (0, academyAddress_1.isStaleAcademyAddress)(source.fa) ||
        (0, academyAddress_1.isStaleAcademyAddress)(source.ps) ||
        String(source.en ?? '').trim() !== resolved.en ||
        String(source.fa ?? '').trim() !== resolved.fa ||
        String(source.ps ?? '').trim() !== resolved.ps);
}
async function getOrCreateContactSettings() {
    const existing = await ContactSetting_1.ContactSetting.findOne({
        key: 'academy',
        isDeleted: false
    }).lean();
    if (!existing) {
        return ContactSetting_1.ContactSetting.create(defaultContactSettings);
    }
    if (addressNeedsBackfill(existing.address)) {
        const address = (0, academyAddress_1.resolveAcademyAddress)(existing.address);
        await ContactSetting_1.ContactSetting.updateOne({ _id: existing._id }, { $set: { address } });
        return { ...existing, address };
    }
    return existing;
}
contactSettingsPublicRouter.get('/', async (_req, res, next) => {
    try {
        const item = await getOrCreateContactSettings();
        res.json((0, response_1.createResponse)(serializeContactSettings(item)));
    }
    catch (error) {
        next(error);
    }
});
contactSettingsAdminRouter.get('/', async (req, res, next) => {
    try {
        const role = req.user?.canonicalRole ?? req.user?.role;
        if (!['super_admin', 'admin', 'branch_manager', 'owner'].includes(String(role))) {
            return res.status(403).json((0, response_1.createError)('Forbidden'));
        }
        const item = await getOrCreateContactSettings();
        res.json((0, response_1.createResponse)(serializeContactSettings(item)));
    }
    catch (error) {
        next(error);
    }
});
contactSettingsAdminRouter.put('/', (0, validate_1.validate)(updateSchema), async (req, res, next) => {
    try {
        const role = req.user?.canonicalRole ?? req.user?.role;
        if (!['super_admin', 'admin', 'branch_manager', 'owner'].includes(String(role))) {
            return res.status(403).json((0, response_1.createError)('Forbidden'));
        }
        const body = req.body;
        const payload = {
            whatsapp: cleanText(body.whatsapp, 300),
            facebook: sanitizeUrl(body.facebook),
            telegram: sanitizeUrl(body.telegram),
            instagram: sanitizeUrl(body.instagram),
            phone: cleanText(body.phone, 80),
            email: cleanText(body.email, 160).toLowerCase(),
            address: (0, academyAddress_1.resolveAcademyAddress)(cleanLocalized(body.address)),
            supportHours: cleanLocalized(body.supportHours),
            updatedBy: req.user?.userId ?? null
        };
        const item = await ContactSetting_1.ContactSetting.findOneAndUpdate({ key: 'academy', isDeleted: false }, { $set: payload, $setOnInsert: { key: 'academy' } }, { new: true, upsert: true }).lean();
        res.json((0, response_1.createResponse)(serializeContactSettings(item), 'Contact settings updated'));
    }
    catch (error) {
        next(error);
    }
});

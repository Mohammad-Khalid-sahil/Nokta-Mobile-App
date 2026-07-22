"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.languageSettingRouter = void 0;
const express_1 = require("express");
const joi_1 = __importDefault(require("joi"));
const auth_1 = require("../../middlewares/auth");
const validate_1 = require("../../middlewares/validate");
const response_1 = require("../../helpers/response");
const LanguageSetting_1 = require("../../models/LanguageSetting");
const router = (0, express_1.Router)();
const languageSchema = joi_1.default.object({
    body: joi_1.default.object({
        language: joi_1.default.string().valid('en', 'fa', 'ps').required()
    })
});
router.use(auth_1.authenticate);
async function getCurrentLanguageSetting(req, res, next) {
    try {
        const setting = await LanguageSetting_1.LanguageSetting.findOne({
            userId: req.user.userId,
            key: 'app_language',
            isDeleted: false
        }).lean();
        res.json((0, response_1.createResponse)(setting ?? { language: 'en' }));
    }
    catch (error) {
        next(error);
    }
}
router.get('/', getCurrentLanguageSetting);
router.get('/current', getCurrentLanguageSetting);
router.put('/current', (0, validate_1.validate)(languageSchema), async (req, res, next) => {
    try {
        const setting = await LanguageSetting_1.LanguageSetting.findOneAndUpdate({ userId: req.user.userId, key: 'app_language' }, {
            userId: req.user.userId,
            key: 'app_language',
            scope: 'user',
            language: req.body.language
        }, { upsert: true, new: true, runValidators: true }).lean();
        res.json((0, response_1.createResponse)(setting, 'Language updated successfully'));
    }
    catch (error) {
        next(error);
    }
});
exports.languageSettingRouter = router;

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LanguageSetting = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const schema_1 = require("../utils/schema");
const languageSettingSchema = (0, schema_1.createBaseSchema)({
    userId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    key: { type: String, required: true, trim: true, default: 'app_language' },
    language: { type: String, enum: ['en', 'fa', 'ps'], required: true, default: 'en' },
    scope: { type: String, enum: ['global', 'user'], default: 'user' }
}, { collection: 'language_settings' });
languageSettingSchema.index({ userId: 1, key: 1 }, { unique: true, sparse: true });
languageSettingSchema.index({ scope: 1, key: 1 });
exports.LanguageSetting = mongoose_1.default.models.LanguageSetting ?? mongoose_1.default.model('LanguageSetting', languageSettingSchema);

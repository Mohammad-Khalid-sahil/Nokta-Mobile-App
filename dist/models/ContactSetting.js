"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContactSetting = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const schema_1 = require("../utils/schema");
const academyAddress_1 = require("../constants/academyAddress");
const contactSettingSchema = (0, schema_1.createBaseSchema)({
    key: { type: String, required: true, trim: true, unique: true, default: 'academy' },
    whatsapp: { type: String, trim: true, default: '' },
    facebook: { type: String, trim: true, default: '' },
    telegram: { type: String, trim: true, default: '' },
    instagram: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, lowercase: true, default: '' },
    address: {
        en: { type: String, trim: true, default: academyAddress_1.ACADEMY_ADDRESS.en },
        fa: { type: String, trim: true, default: academyAddress_1.ACADEMY_ADDRESS.fa },
        ps: { type: String, trim: true, default: academyAddress_1.ACADEMY_ADDRESS.ps }
    },
    supportHours: {
        en: { type: String, trim: true, default: '' },
        fa: { type: String, trim: true, default: '' },
        ps: { type: String, trim: true, default: '' }
    },
    updatedBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', default: null }
}, { collection: 'contact_settings' });
exports.ContactSetting = mongoose_1.default.models.ContactSetting ??
    mongoose_1.default.model('ContactSetting', contactSettingSchema);

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LegalDocument = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const schema_1 = require("../utils/schema");
const localizedTextSchema = {
    en: { type: String, trim: true, default: '' },
    fa: { type: String, trim: true, default: '' },
    ps: { type: String, trim: true, default: '' }
};
const legalDocumentSchema = (0, schema_1.createBaseSchema)({
    key: {
        type: String,
        enum: ['privacy_policy', 'terms_conditions', 'data_account_policy'],
        required: true,
        unique: true,
        index: true
    },
    title: localizedTextSchema,
    description: localizedTextSchema,
    content: localizedTextSchema,
    version: { type: String, trim: true, default: '1.0' },
    lastUpdatedAt: { type: Date, default: null },
    isPublished: { type: Boolean, default: false, index: true },
    updatedBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', default: null }
}, { collection: 'legal_documents' });
legalDocumentSchema.index({ key: 1, isDeleted: 1 });
exports.LegalDocument = mongoose_1.default.models.LegalDocument ??
    mongoose_1.default.model('LegalDocument', legalDocumentSchema);

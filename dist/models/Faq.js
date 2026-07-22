"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Faq = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const schema_1 = require("../utils/schema");
const localizedTextSchema = {
    en: { type: String, trim: true, default: '' },
    fa: { type: String, trim: true, default: '' },
    ps: { type: String, trim: true, default: '' }
};
const faqSchema = (0, schema_1.createBaseSchema)({
    category: {
        type: String,
        enum: [
            'account',
            'auth',
            'classes',
            'attendance',
            'results',
            'payments',
            'books',
            'messages',
            'settings',
            'support',
            'technical'
        ],
        required: true,
        index: true
    },
    question: localizedTextSchema,
    answer: localizedTextSchema,
    roles: [{ type: String, trim: true }],
    tags: [{ type: String, trim: true }],
    sortOrder: { type: Number, default: 100 },
    isActive: { type: Boolean, default: true, index: true },
    maintainedBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', default: null }
}, { collection: 'faqs' });
faqSchema.index({ category: 1, sortOrder: 1 });
faqSchema.index({ isActive: 1, isDeleted: 1 });
exports.Faq = mongoose_1.default.models.Faq ?? mongoose_1.default.model('Faq', faqSchema);

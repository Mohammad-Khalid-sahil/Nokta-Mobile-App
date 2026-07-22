"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FamilyLink = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const schema_1 = require("../utils/schema");
const familyLinkSchema = (0, schema_1.createBaseSchema)({
    parentId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Parent', required: true, index: true },
    studentId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    relationType: { type: String, enum: ['father', 'mother', 'guardian', 'other'], default: 'guardian' },
    isPrimary: { type: Boolean, default: false }
}, { collection: 'family_links' });
familyLinkSchema.index({ parentId: 1, studentId: 1 }, { unique: true });
exports.FamilyLink = mongoose_1.default.models.FamilyLink ?? mongoose_1.default.model('FamilyLink', familyLinkSchema);

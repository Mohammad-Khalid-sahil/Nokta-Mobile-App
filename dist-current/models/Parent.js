"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ParentProfile = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const schema_1 = require("../utils/schema");
const parentSchema = (0, schema_1.createBaseSchema)({
    userId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    branchId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    guardianName: { type: String, required: true, trim: true },
    guardianPhone: { type: String, required: true, trim: true },
    guardianEmail: { type: String, default: '', trim: true, lowercase: true },
    relationType: { type: String, enum: ['father', 'mother', 'guardian', 'other'], default: 'guardian' },
    linkedStudentIds: [{ type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Student' }],
    readOnlyAccess: { type: Boolean, default: true }
}, { collection: 'parents' });
parentSchema.index({ guardianPhone: 1, branchId: 1 });
exports.ParentProfile = mongoose_1.default.models.Parent ?? mongoose_1.default.model('Parent', parentSchema);

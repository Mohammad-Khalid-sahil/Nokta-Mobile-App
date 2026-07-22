"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SalarySetting = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const schema_1 = require("../utils/schema");
const salarySettingSchema = (0, schema_1.createBaseSchema)({
    userId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, enum: ['teacher', 'admin', 'manager'], required: true, index: true },
    branchId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    salaryType: { type: String, enum: ['fixed', 'percentage', 'fixed_plus_percentage'], required: true, default: 'fixed' },
    fixedAmount: { type: Number, min: 0, default: 0 },
    percentage: { type: Number, min: 0, max: 100, default: 0 },
    percentageScope: { type: String, enum: ['branch', 'all_system'], default: 'branch' },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', default: null }
}, { collection: 'salary_settings' });
salarySettingSchema.index({ userId: 1, role: 1, isActive: 1 });
exports.SalarySetting = mongoose_1.default.models.SalarySetting ?? mongoose_1.default.model('SalarySetting', salarySettingSchema);

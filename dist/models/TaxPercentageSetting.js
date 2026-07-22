"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaxPercentageSetting = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const schema_1 = require("../utils/schema");
const taxPercentageSettingSchema = (0, schema_1.createBaseSchema)({
    branchId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    quarterlyRate: { type: Number, min: 0, max: 100, required: true, default: 0 },
    annualRate: { type: Number, min: 0, max: 100, required: true, default: 0 },
    monthlyQuarterlyEnabled: { type: Boolean, default: false },
    showAnnualEstimatedShare: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true, index: true },
    effectiveFrom: { type: Date, required: true, default: Date.now, index: true },
    effectiveTo: { type: Date, default: null, index: true },
    createdBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', default: null }
}, { collection: 'tax_percentage_settings' });
taxPercentageSettingSchema.index({ branchId: 1, isActive: 1, effectiveFrom: -1 });
exports.TaxPercentageSetting = mongoose_1.default.models.TaxPercentageSetting ?? mongoose_1.default.model('TaxPercentageSetting', taxPercentageSettingSchema);

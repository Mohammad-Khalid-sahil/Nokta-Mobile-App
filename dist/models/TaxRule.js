"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaxRule = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const schema_1 = require("../utils/schema");
const taxRuleSchema = (0, schema_1.createBaseSchema)({
    minAmount: { type: Number, required: true, min: 0, index: true },
    maxAmount: { type: Number, default: null },
    baseTax: { type: Number, required: true, min: 0, default: 0 },
    percentage: { type: Number, required: true, min: 0, max: 100, default: 0 },
    categoryNameDari: { type: String, required: true, trim: true },
    explanationDari: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true, index: true },
    effectiveFrom: { type: Date, required: true, default: Date.now, index: true },
    effectiveTo: { type: Date, default: null, index: true }
}, { collection: 'tax_rules' });
taxRuleSchema.index({ effectiveFrom: 1, effectiveTo: 1, isActive: 1 });
exports.TaxRule = mongoose_1.default.models.TaxRule ?? mongoose_1.default.model('TaxRule', taxRuleSchema);

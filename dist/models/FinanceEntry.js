"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FinanceEntry = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const schema_1 = require("../utils/schema");
const financeEntrySchema = (0, schema_1.createBaseSchema)({
    branchId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    title: { type: String, required: true, trim: true },
    amount: { type: Number, required: true },
    category: { type: String, required: true, trim: true, index: true },
    date: { type: Date, default: Date.now, index: true },
    createdBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', default: null },
    source: { type: String, enum: ['manual_income', 'scholarship', 'donation', 'other'], default: 'manual_income' },
    notes: { type: String, default: '', trim: true },
    immutableRecord: { type: Boolean, default: true },
    auditHistory: { type: [schema_1.auditHistorySchema], default: [] }
}, { collection: 'finance_entries' });
financeEntrySchema.index({ date: -1, branchId: 1 });
exports.FinanceEntry = mongoose_1.default.models.FinanceEntry ?? mongoose_1.default.model('FinanceEntry', financeEntrySchema);

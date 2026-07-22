"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Report = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const schema_1 = require("../utils/schema");
const reportSchema = (0, schema_1.createBaseSchema)({
    branchId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    generatedBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', default: null },
    type: { type: String, enum: ['financial', 'attendance', 'academic', 'security', 'operations'], required: true, index: true },
    title: { type: String, required: true, trim: true },
    periodKey: { type: String, default: '', trim: true, index: true },
    data: { type: mongoose_1.default.Schema.Types.Mixed, default: {} },
    exportedAt: { type: Date, default: null },
    status: { type: String, enum: ['draft', 'generated', 'exported'], default: 'generated', index: true }
}, { collection: 'reports' });
reportSchema.index({ type: 1, periodKey: 1, branchId: 1 });
exports.Report = mongoose_1.default.models.Report ?? mongoose_1.default.model('Report', reportSchema);

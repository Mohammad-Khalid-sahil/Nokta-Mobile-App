"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Branch = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const schema_1 = require("../utils/schema");
const branchSchema = (0, schema_1.createBaseSchema)({
    name: { type: String, required: true, trim: true, index: true },
    code: { type: String, required: true, trim: true, unique: true, uppercase: true },
    address: { type: String, default: '', trim: true },
    city: { type: String, default: '', trim: true },
    country: { type: String, default: 'Afghanistan', trim: true },
    phone: { type: String, default: '', trim: true },
    email: { type: String, default: '', trim: true, lowercase: true },
    ownerId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Owner', default: null, index: true },
    managerId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    active: { type: Boolean, default: true, index: true },
    timezone: { type: String, default: 'Asia/Kabul' },
    deleteRequestedAt: { type: Date, default: null },
    deleteRequestedBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', default: null },
    ownerDeleteApprovedAt: { type: Date, default: null },
    ownerDeleteApprovedBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', default: null },
    auditHistory: { type: [schema_1.auditHistorySchema], default: [] }
}, { collection: 'branches' });
branchSchema.index({ code: 1 }, { unique: true });
branchSchema.index({ ownerId: 1, active: 1 });
exports.Branch = mongoose_1.default.models.Branch ?? mongoose_1.default.model('Branch', branchSchema);

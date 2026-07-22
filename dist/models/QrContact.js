"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QrContact = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const schema_1 = require("../utils/schema");
const qrContactSchema = (0, schema_1.createBaseSchema)({
    userId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    branchId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    label: { type: String, required: true, trim: true },
    qrValue: { type: String, required: true, trim: true },
    contactType: { type: String, enum: ['student', 'teacher', 'parent', 'branch', 'support'], default: 'support' },
    active: { type: Boolean, default: true }
}, { collection: 'qr_contacts' });
qrContactSchema.index({ qrValue: 1 }, { unique: true });
exports.QrContact = mongoose_1.default.models.QrContact ?? mongoose_1.default.model('QrContact', qrContactSchema);

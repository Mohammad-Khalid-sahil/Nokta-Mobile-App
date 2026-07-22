"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Family = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const familySchema = new mongoose_1.default.Schema({
    guardianName: { type: String, required: true, trim: true },
    guardianEmail: { type: String, required: true, trim: true },
    guardianPhone: { type: String, required: true, trim: true },
    students: [{ type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Student' }],
    notes: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
});
familySchema.index({ guardianEmail: 1 });
exports.Family = mongoose_1.default.models.Family ?? mongoose_1.default.model('Family', familySchema);

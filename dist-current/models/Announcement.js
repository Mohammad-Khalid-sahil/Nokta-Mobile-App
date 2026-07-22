"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Announcement = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const schema_1 = require("../utils/schema");
const announcementSchema = (0, schema_1.createBaseSchema)({
    branchId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    audienceRoles: [{ type: String, trim: true }],
    publishedBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', default: null },
    publishedAt: { type: Date, default: Date.now, index: true },
    expiresAt: { type: Date, default: null }
}, { collection: 'announcements' });
announcementSchema.index({ branchId: 1, publishedAt: -1 });
exports.Announcement = mongoose_1.default.models.Announcement ?? mongoose_1.default.model('Announcement', announcementSchema);

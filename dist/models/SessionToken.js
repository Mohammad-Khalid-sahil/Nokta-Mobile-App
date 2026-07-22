"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionToken = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const schema_1 = require("../utils/schema");
const sessionTokenSchema = (0, schema_1.createBaseSchema)({
    userId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sessionId: { type: String, trim: true, index: true, default: null },
    tokenHash: { type: String, trim: true, required: true },
    tokenType: { type: String, enum: ['refresh', 'password_reset', 'email_verification', 'phone_verification', 'access_blacklist'], required: true, index: true },
    deviceId: { type: String, trim: true, default: '' },
    deviceName: { type: String, trim: true, default: '' },
    userAgent: { type: String, trim: true, default: '' },
    ipAddress: { type: String, trim: true, default: '' },
    expiresAt: { type: Date, required: true, index: true },
    revokedAt: { type: Date, default: null, index: true },
    revokedBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', default: null },
    replacedBySessionId: { type: String, trim: true, default: null },
    lastUsedAt: { type: Date, default: null },
    reason: { type: String, trim: true, default: '' },
    metadata: { type: mongoose_1.default.Schema.Types.Mixed, default: {} }
}, { collection: 'session_tokens' });
sessionTokenSchema.index({ userId: 1, tokenType: 1, revokedAt: 1 });
sessionTokenSchema.index({ sessionId: 1, tokenType: 1 }, { unique: true, sparse: true });
sessionTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
exports.SessionToken = mongoose_1.default.models.SessionToken ?? mongoose_1.default.model('SessionToken', sessionTokenSchema);

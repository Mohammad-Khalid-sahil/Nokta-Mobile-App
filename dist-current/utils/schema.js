"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.deviceSchema = exports.auditHistorySchema = exports.softDeleteFields = void 0;
exports.createBaseSchema = createBaseSchema;
const mongoose_1 = __importStar(require("mongoose"));
exports.softDeleteFields = {
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', default: null }
};
exports.auditHistorySchema = new mongoose_1.Schema({
    originalValue: { type: mongoose_1.default.Schema.Types.Mixed, default: null },
    changedValue: { type: mongoose_1.default.Schema.Types.Mixed, default: null },
    changedBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', default: null },
    changedAt: { type: Date, default: Date.now },
    reason: { type: String, trim: true, default: '' }
}, { _id: false });
exports.deviceSchema = new mongoose_1.Schema({
    deviceId: { type: String, trim: true, required: true },
    userAgent: { type: String, trim: true, default: '' },
    ipAddress: { type: String, trim: true, default: '' },
    lastSeenAt: { type: Date, default: Date.now },
    trusted: { type: Boolean, default: false }
}, { _id: false });
function createBaseSchema(definition, options = {}) {
    return new mongoose_1.Schema({
        ...definition,
        ...exports.softDeleteFields
    }, {
        timestamps: true,
        minimize: false,
        versionKey: false,
        ...options
    });
}

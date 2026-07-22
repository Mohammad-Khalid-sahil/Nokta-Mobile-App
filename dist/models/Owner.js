"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OwnerProfile = exports.Owner = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const schema_1 = require("../utils/schema");
const ownerSchema = (0, schema_1.createBaseSchema)({
    userId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    branchIds: [{ type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Branch' }],
    title: { type: String, default: 'Owner', trim: true },
    policyAccess: { type: Boolean, default: true },
    analyticsAccess: { type: Boolean, default: true },
    dailyOperationsAccess: { type: Boolean, default: false }
}, { collection: 'owners' });
ownerSchema.index({ userId: 1 }, { unique: true });
exports.Owner = mongoose_1.default.models.Owner ?? mongoose_1.default.model('Owner', ownerSchema);
exports.OwnerProfile = exports.Owner;

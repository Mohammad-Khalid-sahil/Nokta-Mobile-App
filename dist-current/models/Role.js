"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Role = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const schema_1 = require("../utils/schema");
const systemMasterRules_1 = require("../config/systemMasterRules");
const roleSchema = (0, schema_1.createBaseSchema)({
    key: { type: String, required: true, unique: true, uppercase: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, enum: systemMasterRules_1.enterpriseRoles },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    scope: { type: String, enum: ['global', 'operational', 'instructional', 'self', 'linked-family', 'governance', 'branch', 'service'], default: 'operational' },
    isSystemRole: { type: Boolean, default: true },
    permissionKeys: [{ type: String, required: true }]
}, { collection: 'roles' });
roleSchema.index({ slug: 1 }, { unique: true });
exports.Role = mongoose_1.default.models.Role ?? mongoose_1.default.model('Role', roleSchema);

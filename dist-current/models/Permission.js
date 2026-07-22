"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Permission = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const schema_1 = require("../utils/schema");
const permissionSchema = (0, schema_1.createBaseSchema)({
    key: { type: String, required: true, unique: true, uppercase: true, trim: true },
    module: { type: String, required: true, trim: true },
    action: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    riskLevel: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' }
}, { collection: 'permissions' });
permissionSchema.index({ module: 1, action: 1 }, { unique: true });
exports.Permission = mongoose_1.default.models.Permission ?? mongoose_1.default.model('Permission', permissionSchema);

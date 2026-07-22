"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Advertisement = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const schema_1 = require("../utils/schema");
const advertisementSchema = (0, schema_1.createBaseSchema)({
    branchId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    imageUrl: { type: String, default: '', trim: true },
    targetUrl: { type: String, default: '', trim: true },
    startsAt: { type: Date, default: Date.now },
    endsAt: { type: Date, default: null, index: true },
    active: { type: Boolean, default: true, index: true }
}, { collection: 'advertisements' });
advertisementSchema.index({ active: 1, startsAt: 1, endsAt: 1 });
exports.Advertisement = mongoose_1.default.models.Advertisement ?? mongoose_1.default.model('Advertisement', advertisementSchema);

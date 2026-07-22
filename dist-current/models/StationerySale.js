"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StationerySale = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const schema_1 = require("../utils/schema");
const stationerySaleSchema = (0, schema_1.createBaseSchema)({
    branchId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    bookId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Book', default: null, index: true },
    studentId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    soldBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', default: null },
    receiptNumber: { type: String, trim: true, default: '', index: true },
    title: { type: String, required: true, trim: true },
    quantity: { type: Number, default: 1 },
    unitPrice: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    paymentStatus: { type: String, enum: ['paid', 'partial', 'unpaid'], default: 'paid', index: true },
    paidAmount: { type: Number, default: 0 },
    notes: { type: String, trim: true, default: '' },
    saleDate: { type: Date, default: Date.now, index: true }
}, { collection: 'stationery_sales' });
stationerySaleSchema.index({ branchId: 1, saleDate: -1 });
stationerySaleSchema.index({ receiptNumber: 1 }, { unique: true, sparse: true });
exports.StationerySale = mongoose_1.default.models.StationerySale ?? mongoose_1.default.model('StationerySale', stationerySaleSchema);

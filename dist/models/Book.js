"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Book = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const schema_1 = require("../utils/schema");
const localizedTextSchema = {
    en: { type: String, trim: true, default: '' },
    fa: { type: String, trim: true, default: '' },
    ps: { type: String, trim: true, default: '' }
};
const bookSchema = (0, schema_1.createBaseSchema)({
    branchId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    title: { type: String, required: true, trim: true, index: true },
    author: { type: String, trim: true, default: '' },
    isbn: { type: String, required: true, trim: true, index: true },
    category: { type: String, default: 'General', trim: true, index: true },
    subject: { type: mongoose_1.default.Schema.Types.Mixed, default: '' },
    course: { type: mongoose_1.default.Schema.Types.Mixed, default: '' },
    language: { type: String, trim: true, default: '' },
    edition: { type: String, trim: true, default: '' },
    publisher: { type: String, trim: true, default: '' },
    publicationDate: { type: Date, default: null },
    stockQuantity: { type: Number, default: 0, min: 0 },
    price: { type: Number, default: 0, min: 0 },
    available: { type: Boolean, default: true, index: true },
    description: { type: mongoose_1.default.Schema.Types.Mixed, default: '' },
    coverImage: { type: String, trim: true, default: '' },
    coverUrl: { type: String, trim: true, default: '' },
    fileUrl: { type: String, trim: true, default: '' },
    fileName: { type: String, trim: true, default: '' },
    fileOriginalName: { type: String, trim: true, default: '' },
    fileMimeType: { type: String, trim: true, default: '' },
    fileType: { type: String, trim: true, default: '' },
    fileSize: { type: Number, default: 0, min: 0 },
    uploadedAt: { type: Date, default: null },
    localizedTitle: { type: localizedTextSchema, default: () => ({}) },
    localizedDescription: { type: localizedTextSchema, default: () => ({}) }
}, { collection: 'books' });
bookSchema.index({ branchId: 1, title: 1 });
bookSchema.index({ isbn: 1, branchId: 1 }, { unique: true, sparse: true });
exports.Book = mongoose_1.default.models.Book ?? mongoose_1.default.model('Book', bookSchema);

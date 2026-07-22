import mongoose from 'mongoose';
import { createBaseSchema } from '../utils/schema';

const localizedTextSchema = {
  en: { type: String, trim: true, default: '' },
  fa: { type: String, trim: true, default: '' },
  ps: { type: String, trim: true, default: '' }
};

const bookSchema = createBaseSchema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    title: { type: String, required: true, trim: true, index: true },
    author: { type: String, trim: true, default: '' },
    isbn: { type: String, required: true, trim: true, index: true },
    category: { type: String, default: 'General', trim: true, index: true },
    subject: { type: mongoose.Schema.Types.Mixed, default: '' },
    course: { type: mongoose.Schema.Types.Mixed, default: '' },
    language: { type: String, trim: true, default: '' },
    edition: { type: String, trim: true, default: '' },
    publisher: { type: String, trim: true, default: '' },
    publicationDate: { type: Date, default: null },
    stockQuantity: { type: Number, default: 0, min: 0 },
    price: { type: Number, default: 0, min: 0 },
    available: { type: Boolean, default: true, index: true },
    description: { type: mongoose.Schema.Types.Mixed, default: '' },
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
  },
  { collection: 'books' }
);

bookSchema.index({ branchId: 1, title: 1 });
bookSchema.index({ isbn: 1, branchId: 1 }, { unique: true, sparse: true });

export const Book = mongoose.models.Book ?? mongoose.model('Book', bookSchema);

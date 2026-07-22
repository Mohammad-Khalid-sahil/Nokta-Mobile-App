import mongoose from 'mongoose';
import { createBaseSchema } from '../utils/schema';

const announcementSchema = createBaseSchema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    audienceRoles: [{ type: String, trim: true }],
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    publishedAt: { type: Date, default: Date.now, index: true },
    expiresAt: { type: Date, default: null }
  },
  { collection: 'announcements' }
);

announcementSchema.index({ branchId: 1, publishedAt: -1 });

export const Announcement = mongoose.models.Announcement ?? mongoose.model('Announcement', announcementSchema);

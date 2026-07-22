import mongoose from 'mongoose';

const familySchema = new mongoose.Schema({
  guardianName: { type: String, required: true, trim: true },
  guardianEmail: { type: String, required: true, trim: true },
  guardianPhone: { type: String, required: true, trim: true },
  students: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }],
  notes: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

familySchema.index({ guardianEmail: 1 });

export const Family = mongoose.models.Family ?? mongoose.model('Family', familySchema);

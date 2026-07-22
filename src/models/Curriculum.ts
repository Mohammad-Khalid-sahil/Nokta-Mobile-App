import mongoose from 'mongoose';
import { createBaseSchema } from '../utils/schema';

const curriculumSchema = createBaseSchema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', default: null, index: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', default: null, index: true },
    title: { type: String, required: true, trim: true, index: true },
    code: { type: String, required: true, trim: true, uppercase: true, index: true },
    level: { type: String, trim: true, default: 'Foundational' },
    academicYear: { type: String, trim: true, default: '' },
    term: { type: String, enum: ['annual', 'semester_1', 'semester_2', 'quarter_1', 'quarter_2', 'quarter_3', 'quarter_4'], default: 'annual' },
    weeklyHours: { type: Number, min: 0, default: 0 },
    durationWeeks: { type: Number, min: 0, default: 0 },
    objectives: { type: String, required: true, trim: true },
    learningOutcomes: { type: String, required: true, trim: true },
    standards: { type: String, trim: true, default: '' },
    scopeSequence: { type: String, trim: true, default: '' },
    assessmentPlan: { type: String, trim: true, default: '' },
    resources: { type: String, trim: true, default: '' },
    status: { type: String, enum: ['draft', 'approved', 'archived'], default: 'draft', index: true },
    active: { type: Boolean, default: true, index: true }
  },
  { collection: 'curricula' }
);

curriculumSchema.index({ code: 1, branchId: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });
curriculumSchema.index({ classId: 1, subjectId: 1, status: 1 });

export const Curriculum = mongoose.models.Curriculum ?? mongoose.model('Curriculum', curriculumSchema);

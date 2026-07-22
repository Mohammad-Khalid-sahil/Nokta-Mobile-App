import mongoose from 'mongoose';
import { createBaseSchema } from '../utils/schema';

const questionSchema = createBaseSchema(
  {
    examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true, index: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
    text: { type: String, required: true, trim: true },
    type: { type: String, enum: ['mcq', 'short_answer', 'essay', 'true_false'], default: 'mcq' },
    options: [{ type: String, trim: true }],
    correctAnswer: { type: mongoose.Schema.Types.Mixed, default: null },
    marks: { type: Number, default: 1 },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' }
  },
  { collection: 'questions' }
);

questionSchema.index({ examId: 1, subjectId: 1 });

export const Question = mongoose.models.Question ?? mongoose.model('Question', questionSchema);

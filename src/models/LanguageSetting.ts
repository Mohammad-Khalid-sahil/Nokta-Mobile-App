import mongoose from 'mongoose';
import { createBaseSchema } from '../utils/schema';

const languageSettingSchema = createBaseSchema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    key: { type: String, required: true, trim: true, default: 'app_language' },
    language: { type: String, enum: ['en', 'fa', 'ps'], required: true, default: 'en' },
    scope: { type: String, enum: ['global', 'user'], default: 'user' }
  },
  { collection: 'language_settings' }
);

languageSettingSchema.index({ userId: 1, key: 1 }, { unique: true, sparse: true });
languageSettingSchema.index({ scope: 1, key: 1 });

export const LanguageSetting = mongoose.models.LanguageSetting ?? mongoose.model('LanguageSetting', languageSettingSchema);

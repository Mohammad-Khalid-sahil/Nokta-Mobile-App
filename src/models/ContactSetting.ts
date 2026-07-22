import mongoose from 'mongoose';
import { createBaseSchema } from '../utils/schema';
import { ACADEMY_ADDRESS } from '../constants/academyAddress';

const contactSettingSchema = createBaseSchema(
  {
    key: { type: String, required: true, trim: true, unique: true, default: 'academy' },
    whatsapp: { type: String, trim: true, default: '' },
    facebook: { type: String, trim: true, default: '' },
    telegram: { type: String, trim: true, default: '' },
    instagram: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, lowercase: true, default: '' },
    address: {
      en: { type: String, trim: true, default: ACADEMY_ADDRESS.en },
      fa: { type: String, trim: true, default: ACADEMY_ADDRESS.fa },
      ps: { type: String, trim: true, default: ACADEMY_ADDRESS.ps }
    },
    supportHours: {
      en: { type: String, trim: true, default: '' },
      fa: { type: String, trim: true, default: '' },
      ps: { type: String, trim: true, default: '' }
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
  },
  { collection: 'contact_settings' }
);

export const ContactSetting =
  mongoose.models.ContactSetting ??
  mongoose.model('ContactSetting', contactSettingSchema);

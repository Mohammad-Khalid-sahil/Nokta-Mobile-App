import mongoose from 'mongoose';
import { createBaseSchema } from '../utils/schema';

const permissionSchema = createBaseSchema(
  {
    key: { type: String, required: true, unique: true, uppercase: true, trim: true },
    module: { type: String, required: true, trim: true },
    action: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    riskLevel: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' }
  },
  { collection: 'permissions' }
);

permissionSchema.index({ module: 1, action: 1 }, { unique: true });

export const Permission = mongoose.models.Permission ?? mongoose.model('Permission', permissionSchema);

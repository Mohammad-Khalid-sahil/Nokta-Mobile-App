import mongoose from 'mongoose';
import { createBaseSchema } from '../utils/schema';
import { enterpriseRoles } from '../config/systemMasterRules';

const roleSchema = createBaseSchema(
  {
    key: { type: String, required: true, unique: true, uppercase: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, enum: enterpriseRoles },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    scope: { type: String, enum: ['global', 'operational', 'instructional', 'self', 'linked-family', 'governance', 'branch', 'service'], default: 'operational' },
    isSystemRole: { type: Boolean, default: true },
    permissionKeys: [{ type: String, required: true }]
  },
  { collection: 'roles' }
);

roleSchema.index({ slug: 1 }, { unique: true });

export const Role = mongoose.models.Role ?? mongoose.model('Role', roleSchema);

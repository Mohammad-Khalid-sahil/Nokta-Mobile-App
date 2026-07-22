import mongoose, { Schema, type SchemaDefinition, type SchemaOptions } from 'mongoose';

export const softDeleteFields = {
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: { type: Date, default: null },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
};

export const auditHistorySchema = new Schema(
  {
    originalValue: { type: mongoose.Schema.Types.Mixed, default: null },
    changedValue: { type: mongoose.Schema.Types.Mixed, default: null },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    changedAt: { type: Date, default: Date.now },
    reason: { type: String, trim: true, default: '' }
  },
  { _id: false }
);

export const deviceSchema = new Schema(
  {
    deviceId: { type: String, trim: true, required: true },
    userAgent: { type: String, trim: true, default: '' },
    ipAddress: { type: String, trim: true, default: '' },
    lastSeenAt: { type: Date, default: Date.now },
    trusted: { type: Boolean, default: false }
  },
  { _id: false }
);

export function createBaseSchema(definition: SchemaDefinition, options: SchemaOptions = {}) {
  return new Schema(
    {
      ...definition,
      ...softDeleteFields
    },
    {
      timestamps: true,
      minimize: false,
      versionKey: false,
      ...options
    }
  );
}

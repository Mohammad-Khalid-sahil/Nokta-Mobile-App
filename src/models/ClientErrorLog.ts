import mongoose, { Schema } from 'mongoose';

const clientErrorLogSchema = new Schema(
  {
    message: { type: String, required: true, trim: true },
    stacktrace: { type: String, default: '' },
    appVersion: { type: String, default: '', trim: true },
    buildNumber: { type: String, default: '', trim: true },
    platform: { type: String, default: '', trim: true, index: true },
    platformVersion: { type: String, default: '', trim: true },
    deviceId: { type: String, default: '', trim: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    context: { type: Schema.Types.Mixed, default: {} },
    clientTimestamp: { type: Date, default: null }
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'client_error_logs'
  }
);

clientErrorLogSchema.index({ createdAt: -1 });

export const ClientErrorLog =
  mongoose.models.ClientErrorLog ?? mongoose.model('ClientErrorLog', clientErrorLogSchema);

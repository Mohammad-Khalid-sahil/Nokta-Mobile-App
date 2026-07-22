import mongoose, { Schema } from 'mongoose';

const analyticsEventSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    parameters: { type: Schema.Types.Mixed, default: {} },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    context: { type: Schema.Types.Mixed, default: {} },
    clientTimestamp: { type: Date, default: null }
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'analytics_events'
  }
);

analyticsEventSchema.index({ createdAt: -1 });

export const AnalyticsEvent =
  mongoose.models.AnalyticsEvent ?? mongoose.model('AnalyticsEvent', analyticsEventSchema);

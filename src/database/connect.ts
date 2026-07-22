import '../models';
import mongoose from 'mongoose';
import { config } from '../config/env';

export async function connectDatabase() {
  await mongoose.connect(config.mongoUri, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    maxIdleTimeMS: 30000,
    maxPoolSize: 50
  });
  mongoose.set('strictQuery', true);

  mongoose.connection.on('connected', () => {
    console.log(`MongoDB connected (${mongoose.connection.name})`);
  });

  mongoose.connection.on('error', (err) => {
    console.error('MongoDB connection error:', err);
  });
}

export async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

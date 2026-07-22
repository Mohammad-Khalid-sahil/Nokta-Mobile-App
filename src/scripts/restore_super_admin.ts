import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { connectDatabase } from '../database/connect';
import { User } from '../models/User';
import { PASSWORD_SALT_ROUNDS } from '../utils/password';

async function restoreSuperAdmin() {
  const email = (process.env.SEED_SUPER_ADMIN_EMAIL || 'maihan@gmail.com').trim().toLowerCase();
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD || '12345678';

  if (!password || password.length < 8) {
    throw new Error('SEED_SUPER_ADMIN_PASSWORD must be at least 8 characters.');
  }

  const hashedPassword = await bcrypt.hash(password, PASSWORD_SALT_ROUNDS);
  const existing = await User.findOne({ email }).select('+password');

  if (existing) {
    existing.name = existing.name || 'Maihan';
    existing.password = hashedPassword;
    existing.role = 'super_admin';
    existing.status = 'active';
    existing.active = true;
    existing.isDeleted = false;
    existing.mustChangePassword = false;
    existing.failedLoginAttempts = 0;
    existing.lockedUntil = null;
    await existing.save();
    console.log(`Super admin updated: ${email}`);
    return;
  }

  await User.create({
    name: 'Maihan',
    email,
    password: hashedPassword,
    role: 'super_admin',
    status: 'active',
    active: true,
    mustChangePassword: false
  });
  console.log(`Super admin created: ${email}`);
}

async function main() {
  try {
    await connectDatabase();
    await restoreSuperAdmin();
  } catch (error) {
    console.error('Failed to restore super admin:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

void main();

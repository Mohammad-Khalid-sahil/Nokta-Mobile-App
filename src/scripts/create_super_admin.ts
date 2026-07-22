import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { connectDatabase } from '../database/connect';
import { User } from '../models/User';

async function createSuperAdmin() {
  console.log('Creating super admin...');
  const adminEmail = process.env.SUPER_ADMIN_EMAIL || 'admin@example.com';
  const adminPassword = process.env.SUPER_ADMIN_PASSWORD;
  if (!adminPassword || adminPassword.length < 8) {
    throw new Error('SUPER_ADMIN_PASSWORD must be set and at least 8 characters.');
  }
  const hashedPassword = await bcrypt.hash(adminPassword, 10);
  const superAdmin = await User.create({
    name: 'Super Admin',
    email: adminEmail,
    phone: '0780000000',
    password: hashedPassword,
    role: 'super_admin'
  });
  console.log('Super admin created successfully!');
  console.log(`Email: ${adminEmail}`);
  console.log('Password: [provided via SUPER_ADMIN_PASSWORD]');
  return superAdmin;
}

async function main() {
  try {
    await connectDatabase();
    await createSuperAdmin();
  } catch (error) {
    console.error('Error creating super admin:', error);
  } finally {
    await mongoose.disconnect();
  }
}

main();
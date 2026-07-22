/**
 * Unlock all student login accounts (failed-attempt lock / status locked).
 * Usage: npx ts-node src/scripts/unlock_all_students.ts
 */
import mongoose from 'mongoose';
import { config } from '../config/env';
import { User } from '../models/User';

async function main() {
  await mongoose.connect(config.mongoUri);

  const filter = {
    isDeleted: { $ne: true },
    $or: [{ role: 'student' }, { role: 'family_student' }],
  };

  const result = await User.updateMany(filter, {
    $set: {
      failedLoginAttempts: 0,
      lockedUntil: null,
      active: true,
    },
  });

  const statusFix = await User.updateMany(
    { ...filter, status: 'locked' },
    { $set: { status: 'active' } },
  );

  const locked = await User.find({
    ...filter,
    $or: [
      { lockedUntil: { $gt: new Date() } },
      { status: { $in: ['locked', 'blocked'] } },
    ],
  })
    .select('email status lockedUntil failedLoginAttempts')
    .lean();

  console.log(
    JSON.stringify(
      {
        matched: result.matchedCount,
        modified: result.modifiedCount,
        statusFixed: statusFix.modifiedCount,
        stillProblematic: locked.map((u) => ({
          email: u.email,
          status: u.status,
          lockedUntil: u.lockedUntil,
          failedLoginAttempts: u.failedLoginAttempts,
        })),
      },
      null,
      2,
    ),
  );

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

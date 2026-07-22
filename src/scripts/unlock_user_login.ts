/**
 * Reset failed-login lock for a user (dev/QA support).
 * Usage: npx ts-node src/scripts/unlock_user_login.ts user@example.com
 */
import mongoose from 'mongoose';
import { config } from '../config/env';
import { User } from '../models/User';

async function main() {
  const email = String(process.argv[2] || '').trim().toLowerCase();
  if (!email) {
    console.error('Usage: npx ts-node src/scripts/unlock_user_login.ts <email>');
    process.exit(1);
  }

  await mongoose.connect(config.mongoUri);
  const result = await User.updateOne(
    { email, isDeleted: { $ne: true } },
    {
      $set: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        active: true,
      },
    }
  );
  // If status was only "locked" from failed attempts, restore active login.
  await User.updateOne(
    { email, isDeleted: { $ne: true }, status: 'locked' },
    { $set: { status: 'active' } }
  );
  console.log(JSON.stringify({ email, matched: result.matchedCount, modified: result.modifiedCount }));
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

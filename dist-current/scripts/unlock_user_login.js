"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Reset failed-login lock for a user (dev/QA support).
 * Usage: npx ts-node src/scripts/unlock_user_login.ts user@example.com
 */
const mongoose_1 = __importDefault(require("mongoose"));
const env_1 = require("../config/env");
const User_1 = require("../models/User");
async function main() {
    const email = String(process.argv[2] || '').trim().toLowerCase();
    if (!email) {
        console.error('Usage: npx ts-node src/scripts/unlock_user_login.ts <email>');
        process.exit(1);
    }
    await mongoose_1.default.connect(env_1.config.mongoUri);
    const result = await User_1.User.updateOne({ email, isDeleted: { $ne: true } }, {
        $set: {
            failedLoginAttempts: 0,
            lockedUntil: null,
            active: true,
        },
    });
    // If status was only "locked" from failed attempts, restore active login.
    await User_1.User.updateOne({ email, isDeleted: { $ne: true }, status: 'locked' }, { $set: { status: 'active' } });
    console.log(JSON.stringify({ email, matched: result.matchedCount, modified: result.modifiedCount }));
    await mongoose_1.default.disconnect();
}
main().catch((error) => {
    console.error(error);
    process.exit(1);
});

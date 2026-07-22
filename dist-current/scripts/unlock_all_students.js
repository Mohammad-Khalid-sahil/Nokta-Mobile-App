"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Unlock all student login accounts (failed-attempt lock / status locked).
 * Usage: npx ts-node src/scripts/unlock_all_students.ts
 */
const mongoose_1 = __importDefault(require("mongoose"));
const env_1 = require("../config/env");
const User_1 = require("../models/User");
async function main() {
    await mongoose_1.default.connect(env_1.config.mongoUri);
    const filter = {
        isDeleted: { $ne: true },
        $or: [{ role: 'student' }, { role: 'family_student' }],
    };
    const result = await User_1.User.updateMany(filter, {
        $set: {
            failedLoginAttempts: 0,
            lockedUntil: null,
            active: true,
        },
    });
    const statusFix = await User_1.User.updateMany({ ...filter, status: 'locked' }, { $set: { status: 'active' } });
    const locked = await User_1.User.find({
        ...filter,
        $or: [
            { lockedUntil: { $gt: new Date() } },
            { status: { $in: ['locked', 'blocked'] } },
        ],
    })
        .select('email status lockedUntil failedLoginAttempts')
        .lean();
    console.log(JSON.stringify({
        matched: result.matchedCount,
        modified: result.modifiedCount,
        statusFixed: statusFix.modifiedCount,
        stillProblematic: locked.map((u) => ({
            email: u.email,
            status: u.status,
            lockedUntil: u.lockedUntil,
            failedLoginAttempts: u.failedLoginAttempts,
        })),
    }, null, 2));
    await mongoose_1.default.disconnect();
}
main().catch((error) => {
    console.error(error);
    process.exit(1);
});

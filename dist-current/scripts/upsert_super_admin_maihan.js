"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const connect_1 = require("../database/connect");
const User_1 = require("../models/User");
async function upsertSuperAdmin() {
    const email = process.env.SUPER_ADMIN_EMAIL || 'admin@example.com';
    const password = process.env.SUPER_ADMIN_PASSWORD;
    if (!password || password.length < 8) {
        throw new Error('SUPER_ADMIN_PASSWORD must be set and at least 8 characters.');
    }
    const passwordHash = await bcryptjs_1.default.hash(password, 10);
    const user = await User_1.User.findOneAndUpdate({ email }, {
        $set: {
            name: 'Maihan Super Admin',
            email,
            phone: '0780000001',
            role: 'super_admin',
            password: passwordHash,
            active: true,
            status: 'active',
            mustChangePassword: false,
            failedLoginAttempts: 0,
            lockedUntil: null
        }
    }, { upsert: true, new: true, setDefaultsOnInsert: true });
    console.log('Super admin account is ready.');
    console.log(`Email: ${email}`);
    console.log('Password: [provided via SUPER_ADMIN_PASSWORD]');
    console.log(`User ID: ${user?._id?.toString?.()}`);
}
async function main() {
    try {
        await (0, connect_1.connectDatabase)();
        await upsertSuperAdmin();
    }
    catch (error) {
        console.error('Failed to upsert super admin:', error);
        process.exitCode = 1;
    }
    finally {
        await mongoose_1.default.disconnect();
    }
}
void main();

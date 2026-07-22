"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const connect_1 = require("../database/connect");
const User_1 = require("../models/User");
const password_1 = require("../utils/password");
async function restoreSuperAdmin() {
    const email = (process.env.SEED_SUPER_ADMIN_EMAIL || 'maihan@gmail.com').trim().toLowerCase();
    const password = process.env.SEED_SUPER_ADMIN_PASSWORD || '12345678';
    if (!password || password.length < 8) {
        throw new Error('SEED_SUPER_ADMIN_PASSWORD must be at least 8 characters.');
    }
    const hashedPassword = await bcryptjs_1.default.hash(password, password_1.PASSWORD_SALT_ROUNDS);
    const existing = await User_1.User.findOne({ email }).select('+password');
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
    await User_1.User.create({
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
        await (0, connect_1.connectDatabase)();
        await restoreSuperAdmin();
    }
    catch (error) {
        console.error('Failed to restore super admin:', error);
        process.exitCode = 1;
    }
    finally {
        await mongoose_1.default.disconnect();
    }
}
void main();

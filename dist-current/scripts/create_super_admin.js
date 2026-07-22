"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const connect_1 = require("../database/connect");
const User_1 = require("../models/User");
async function createSuperAdmin() {
    console.log('Creating super admin...');
    const adminEmail = process.env.SUPER_ADMIN_EMAIL || 'admin@example.com';
    const adminPassword = process.env.SUPER_ADMIN_PASSWORD;
    if (!adminPassword || adminPassword.length < 8) {
        throw new Error('SUPER_ADMIN_PASSWORD must be set and at least 8 characters.');
    }
    const hashedPassword = await bcryptjs_1.default.hash(adminPassword, 10);
    const superAdmin = await User_1.User.create({
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
        await (0, connect_1.connectDatabase)();
        await createSuperAdmin();
    }
    catch (error) {
        console.error('Error creating super admin:', error);
    }
    finally {
        await mongoose_1.default.disconnect();
    }
}
main();

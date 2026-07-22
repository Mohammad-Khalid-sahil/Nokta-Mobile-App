"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PASSWORD_MAX_LENGTH = exports.PASSWORD_MIN_LENGTH = exports.PASSWORD_SALT_ROUNDS = void 0;
exports.assertStrongPassword = assertStrongPassword;
exports.hashPassword = hashPassword;
exports.comparePassword = comparePassword;
exports.isPasswordReused = isPasswordReused;
exports.pushPasswordHistory = pushPasswordHistory;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
exports.PASSWORD_SALT_ROUNDS = 12;
exports.PASSWORD_MIN_LENGTH = 8;
exports.PASSWORD_MAX_LENGTH = 64;
function assertStrongPassword(password) {
    const normalizedPassword = String(password ?? '');
    if (normalizedPassword.length < exports.PASSWORD_MIN_LENGTH || normalizedPassword.length > exports.PASSWORD_MAX_LENGTH) {
        throw new Error(`Password must be ${exports.PASSWORD_MIN_LENGTH}-${exports.PASSWORD_MAX_LENGTH} characters.`);
    }
    if (!/[a-z]/.test(normalizedPassword) || !/[A-Z]/.test(normalizedPassword) || !/\d/.test(normalizedPassword)) {
        throw new Error('Password must include upper-case, lower-case, and numeric characters.');
    }
}
async function hashPassword(password) {
    assertStrongPassword(password);
    return bcryptjs_1.default.hash(password, exports.PASSWORD_SALT_ROUNDS);
}
async function comparePassword(password, hash) {
    return bcryptjs_1.default.compare(password, hash);
}
async function isPasswordReused(password, history = []) {
    for (const item of history) {
        if (item?.hash && await bcryptjs_1.default.compare(password, item.hash)) {
            return true;
        }
    }
    return false;
}
function pushPasswordHistory(history = [], hash) {
    return [{ hash, changedAt: new Date() }, ...history.filter(Boolean)].slice(0, 5);
}

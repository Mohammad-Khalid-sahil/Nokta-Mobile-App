"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveHttpStatus = resolveHttpStatus;
exports.resolveHttpMessage = resolveHttpMessage;
const mongoose_1 = __importDefault(require("mongoose"));
function resolveHttpStatus(err) {
    if (!err || typeof err !== 'object') {
        return 500;
    }
    const error = err;
    if (typeof error.statusCode === 'number') {
        return error.statusCode;
    }
    if (typeof error.status === 'number') {
        return error.status;
    }
    if (error.name === 'ValidationError' || error instanceof mongoose_1.default.Error.ValidationError) {
        return 400;
    }
    if (error.name === 'CastError' || error instanceof mongoose_1.default.Error.CastError) {
        return 400;
    }
    if (error.code === 11000) {
        return 409;
    }
    const message = String(error.message ?? '').trim();
    if (!message) {
        return 500;
    }
    if (message.startsWith('CORS blocked:')) {
        return 403;
    }
    if (/forbidden|not authorized|permission denied/i.test(message)) {
        return 403;
    }
    if (/not found/i.test(message)) {
        return 404;
    }
    if (/already exists|duplicate key/i.test(message)) {
        return 409;
    }
    if (/password must/i.test(message) ||
        /required/i.test(message) ||
        /invalid/i.test(message) ||
        /must match/i.test(message) ||
        /must be/i.test(message)) {
        return 400;
    }
    return 500;
}
function resolveHttpMessage(err) {
    if (err instanceof mongoose_1.default.Error.ValidationError) {
        const details = Object.values(err.errors)
            .map((item) => item?.message)
            .filter(Boolean)
            .join('; ');
        return details || err.message;
    }
    if (err instanceof Error && err.message.trim()) {
        return err.message;
    }
    return 'Server error';
}

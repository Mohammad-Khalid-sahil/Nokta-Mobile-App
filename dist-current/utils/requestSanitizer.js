"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizePayload = sanitizePayload;
exports.redactSensitivePayload = redactSensitivePayload;
const inputSecurity_1 = require("./inputSecurity");
const mongoOperatorPattern = /^\$/;
function sanitizeString(value) {
    return (0, inputSecurity_1.sanitizePlainText)(value);
}
function sanitizePayload(value) {
    if (Array.isArray(value)) {
        return value.map((entry) => sanitizePayload(entry));
    }
    if (value && typeof value === 'object') {
        return Object.entries(value).reduce((acc, [key, entry]) => {
            if (mongoOperatorPattern.test(key) || key.includes('.')) {
                return acc;
            }
            acc[key] = sanitizePayload(entry);
            return acc;
        }, {});
    }
    if (typeof value === 'string') {
        return sanitizeString(value);
    }
    return value;
}
function redactSensitivePayload(value) {
    if (Array.isArray(value)) {
        return value.map((entry) => redactSensitivePayload(entry));
    }
    if (value && typeof value === 'object') {
        return Object.entries(value).reduce((acc, [key, entry]) => {
            if (['password', 'refreshToken', 'token', 'currentPassword', 'newPassword', 'confirmPassword'].includes(key)) {
                acc[key] = '[REDACTED]';
                return acc;
            }
            acc[key] = redactSensitivePayload(entry);
            return acc;
        }, {});
    }
    return value;
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizePlainText = sanitizePlainText;
exports.sanitizeRichText = sanitizeRichText;
exports.isSuspiciousInput = isSuspiciousInput;
const SCRIPT_PATTERN = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
const EVENT_HANDLER_PATTERN = /\bon\w+\s*=/gi;
const JS_PROTOCOL_PATTERN = /javascript:/gi;
const HTML_TAG_PATTERN = /<[^>]*>/g;
function sanitizePlainText(value, maxLength = 5000) {
    if (value === null || value === undefined)
        return '';
    return String(value)
        .replace(SCRIPT_PATTERN, '')
        .replace(EVENT_HANDLER_PATTERN, '')
        .replace(JS_PROTOCOL_PATTERN, '')
        .replace(HTML_TAG_PATTERN, '')
        .replace(/[<>]/g, '')
        .replace(/\u0000/g, '')
        .trim()
        .slice(0, maxLength);
}
function sanitizeRichText(value, maxLength = 12000) {
    return sanitizePlainText(value, maxLength);
}
function isSuspiciousInput(value) {
    const text = String(value ?? '');
    return SCRIPT_PATTERN.test(text) || EVENT_HANDLER_PATTERN.test(text) || JS_PROTOCOL_PATTERN.test(text);
}

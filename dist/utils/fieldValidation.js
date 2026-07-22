"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PERSON_NAME_REGEX = exports.AFGHAN_PHONE_REGEX = exports.AFGHAN_MOBILE_PREFIXES = void 0;
exports.isValidAfghanPhone = isValidAfghanPhone;
exports.isValidPersonName = isValidPersonName;
exports.sanitizeAfghanPhone = sanitizeAfghanPhone;
exports.AFGHAN_MOBILE_PREFIXES = ['070', '078', '079', '072', '077', '074'];
exports.AFGHAN_PHONE_REGEX = /^(070|078|079|072|077|074)\d{7}$/;
/** Letters (Latin + Arabic/Persian), spaces, hyphen, apostrophe — no digits. */
exports.PERSON_NAME_REGEX = /^[\p{L}\s'.-]+$/u;
function isValidAfghanPhone(value) {
    const digits = String(value ?? '').replace(/\D/g, '');
    return exports.AFGHAN_PHONE_REGEX.test(digits);
}
function isValidPersonName(value) {
    const text = String(value ?? '').trim();
    if (!text || text.length < 2)
        return false;
    if (/\d/.test(text))
        return false;
    return exports.PERSON_NAME_REGEX.test(text);
}
function sanitizeAfghanPhone(value) {
    let digits = String(value ?? '').replace(/\D/g, '').slice(0, 10);
    if (!digits)
        return '';
    if (digits[0] !== '0')
        return '';
    if (digits.length >= 2 && digits[1] !== '7')
        return digits.slice(0, 1);
    if (digits.length >= 3 && !['0', '2', '4', '7', '8', '9'].includes(digits[2])) {
        return digits.slice(0, 2);
    }
    return digits;
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeFullName = normalizeFullName;
exports.normalizeAccountStatus = normalizeAccountStatus;
exports.splitFullName = splitFullName;
exports.buildUserAccountPayload = buildUserAccountPayload;
const inputSecurity_1 = require("./inputSecurity");
function normalizeFullName(input) {
    const fullName = (0, inputSecurity_1.sanitizePlainText)(input.fullName, 160);
    if (fullName)
        return fullName;
    const legacyName = (0, inputSecurity_1.sanitizePlainText)(input.name, 160);
    if (legacyName)
        return legacyName;
    const firstName = (0, inputSecurity_1.sanitizePlainText)(input.firstName, 80);
    const lastName = (0, inputSecurity_1.sanitizePlainText)(input.lastName, 80);
    return `${firstName} ${lastName}`.trim();
}
function normalizeAccountStatus(value, fallback = 'active') {
    const status = (0, inputSecurity_1.sanitizePlainText)(value, 32).toLowerCase();
    if (status === 'inactive')
        return 'inactive';
    if (status === 'blocked' || status === 'locked' || status === 'suspended')
        return 'blocked';
    return fallback;
}
function splitFullName(fullName) {
    const parts = fullName.split(/\s+/).filter(Boolean);
    if (!parts.length) {
        return { firstName: '', lastName: '', name: '' };
    }
    if (parts.length === 1) {
        return { firstName: parts[0], lastName: '', name: parts[0] };
    }
    return {
        firstName: parts[0],
        lastName: parts.slice(1).join(' '),
        name: fullName
    };
}
function buildUserAccountPayload(input) {
    const fullName = normalizeFullName(input);
    const names = splitFullName(fullName);
    const status = normalizeAccountStatus(input.status ?? input.accountStatus, 'active');
    return {
        name: names.name || fullName,
        firstName: (0, inputSecurity_1.sanitizePlainText)(input.firstName ?? names.firstName, 80),
        lastName: (0, inputSecurity_1.sanitizePlainText)(input.lastName ?? names.lastName, 80),
        email: (0, inputSecurity_1.sanitizePlainText)(input.email, 160).toLowerCase(),
        phone: (0, inputSecurity_1.sanitizePlainText)(input.phone, 40),
        profileImage: (0, inputSecurity_1.sanitizePlainText)(input.profileImage, 500),
        role: (0, inputSecurity_1.sanitizePlainText)(input.role, 40),
        branchId: input.branchId ?? null,
        status: status === 'blocked' ? 'blocked' : status === 'inactive' ? 'inactive' : 'active',
        active: status === 'active'
    };
}

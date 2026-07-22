"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runJwtTests = runJwtTests;
const strict_1 = __importDefault(require("node:assert/strict"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const jwt_1 = require("./jwt");
const registrationCheckoutService_1 = require("../services/registrationCheckoutService");
function testStripJwtClaims() {
    const cleaned = (0, jwt_1.stripJwtClaims)({
        userId: '1',
        role: 'student',
        exp: 9999999999,
        iat: 1,
        jti: 'old-id'
    });
    strict_1.default.equal(cleaned.userId, '1');
    strict_1.default.equal(cleaned.role, 'student');
    strict_1.default.equal('exp' in cleaned, false);
    strict_1.default.equal('iat' in cleaned, false);
    strict_1.default.equal('jti' in cleaned, false);
}
function testSignJwtWithExpiresInOnly() {
    const token = (0, jwt_1.signJwt)({ userId: 'abc', role: 'admin' }, env_1.config.jwtSecret, { expiresIn: '1h' });
    const decoded = jsonwebtoken_1.default.verify(token, env_1.config.jwtSecret);
    strict_1.default.equal(decoded.userId, 'abc');
    strict_1.default.ok(typeof decoded.exp === 'number');
    strict_1.default.ok(decoded.exp > Math.floor(Date.now() / 1000));
}
function testSignJwtRejectsSpreadVerifiedPayload() {
    const first = (0, jwt_1.signJwt)({ purpose: 'test', email: 'a@b.com' }, env_1.config.jwtSecret, { expiresIn: '45m' });
    const verified = jsonwebtoken_1.default.verify(first, env_1.config.jwtSecret);
    strict_1.default.doesNotThrow(() => {
        (0, jwt_1.signJwt)({ ...verified, email: 'a@b.com' }, env_1.config.jwtSecret, { expiresIn: '45m' });
    });
}
function testRegistrationCheckoutRebindDoesNotThrow() {
    const token = (0, registrationCheckoutService_1.createRegistrationCheckoutToken)({
        email: 'student@example.com',
        classId: 'class-1',
        subjectId: 'subject-1',
        teacherId: 'teacher-1',
        classFee: 100,
        subjectFee: 50,
        totalFee: 150,
        currency: 'AFN'
    });
    strict_1.default.doesNotThrow(() => {
        (0, registrationCheckoutService_1.bindPaymentReferenceToCheckoutToken)(token, 'TXN-123456');
    });
    const rebound = (0, registrationCheckoutService_1.bindPaymentReferenceToCheckoutToken)(token, 'TXN-123456');
    const decoded = jsonwebtoken_1.default.verify(rebound, env_1.config.jwtSecret);
    strict_1.default.equal(decoded.paymentReference, 'TXN-123456');
    strict_1.default.equal(decoded.email, 'student@example.com');
}
function testCreateAccessToken() {
    const token = (0, jwt_1.createAccessToken)({ _id: { toString: () => 'user-1' }, role: 'student', branchId: null }, 'student', 'session-1');
    const decoded = jsonwebtoken_1.default.verify(token, env_1.config.jwtSecret);
    strict_1.default.equal(decoded.userId, 'user-1');
    strict_1.default.equal(decoded.role, 'student');
}
function runJwtTests() {
    testStripJwtClaims();
    testSignJwtWithExpiresInOnly();
    testSignJwtRejectsSpreadVerifiedPayload();
    testRegistrationCheckoutRebindDoesNotThrow();
    testCreateAccessToken();
    console.log('jwt.test.ts: all tests passed');
}
if (require.main === module) {
    runJwtTests();
}

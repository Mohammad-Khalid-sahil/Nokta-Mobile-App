"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRegistrationCheckoutToken = createRegistrationCheckoutToken;
exports.verifyRegistrationCheckoutToken = verifyRegistrationCheckoutToken;
exports.bindPaymentReferenceToCheckoutToken = bindPaymentReferenceToCheckoutToken;
exports.buildFeeBreakdown = buildFeeBreakdown;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const feeCalculator_1 = require("../utils/feeCalculator");
const jwt_1 = require("../utils/jwt");
const CHECKOUT_PURPOSE = 'student_registration_checkout';
const CHECKOUT_EXPIRES_IN = '45m';
function checkoutPayloadFields(payload) {
    return {
        purpose: CHECKOUT_PURPOSE,
        email: payload.email,
        classId: payload.classId,
        subjectId: payload.subjectId,
        teacherId: payload.teacherId,
        classFee: payload.classFee,
        subjectFee: payload.subjectFee,
        totalFee: payload.totalFee,
        currency: payload.currency,
        ...(payload.paymentReference ? { paymentReference: payload.paymentReference } : {})
    };
}
function createRegistrationCheckoutToken(payload) {
    return (0, jwt_1.signJwt)(checkoutPayloadFields(payload), env_1.config.jwtSecret, { expiresIn: CHECKOUT_EXPIRES_IN });
}
function verifyRegistrationCheckoutToken(token, expected) {
    const decoded = jsonwebtoken_1.default.verify(token, env_1.config.jwtSecret);
    if (decoded.purpose !== CHECKOUT_PURPOSE) {
        throw new Error('Invalid registration checkout token');
    }
    if (decoded.email !== expected.email.toLowerCase()) {
        throw new Error('Registration checkout token does not match email');
    }
    if (decoded.classId !== expected.classId || decoded.subjectId !== expected.subjectId || decoded.teacherId !== expected.teacherId) {
        throw new Error('Registration checkout token does not match selected class');
    }
    if (Number(decoded.totalFee) !== Number(expected.totalFee)) {
        throw new Error('Registration checkout token does not match server fee');
    }
    if (expected.paymentReference && decoded.paymentReference) {
        if (String(decoded.paymentReference).trim() !== String(expected.paymentReference).trim()) {
            throw new Error('Registration checkout token does not match payment reference');
        }
    }
    return decoded;
}
function bindPaymentReferenceToCheckoutToken(token, paymentReference) {
    const decoded = jsonwebtoken_1.default.verify(token, env_1.config.jwtSecret);
    if (decoded.purpose !== CHECKOUT_PURPOSE) {
        throw new Error('Invalid registration checkout token');
    }
    return createRegistrationCheckoutToken({
        email: decoded.email,
        classId: decoded.classId,
        subjectId: decoded.subjectId,
        teacherId: decoded.teacherId,
        classFee: decoded.classFee,
        subjectFee: decoded.subjectFee,
        totalFee: decoded.totalFee,
        currency: decoded.currency,
        paymentReference: String(paymentReference).trim()
    });
}
function buildFeeBreakdown(klass, subject) {
    return (0, feeCalculator_1.calculateEnrollmentFee)(klass?.feeAmount, subject?.feeAmount);
}

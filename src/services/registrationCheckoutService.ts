import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { calculateEnrollmentFee } from '../utils/feeCalculator';
import { signJwt } from '../utils/jwt';

export type RegistrationCheckoutPayload = {
  email: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  classFee: number;
  subjectFee: number;
  totalFee: number;
  currency: 'AFN';
  paymentReference?: string;
};

const CHECKOUT_PURPOSE = 'student_registration_checkout';
const CHECKOUT_EXPIRES_IN = '45m';

function checkoutPayloadFields(
  payload: RegistrationCheckoutPayload
): Record<string, unknown> {
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

export function createRegistrationCheckoutToken(payload: RegistrationCheckoutPayload) {
  return signJwt(checkoutPayloadFields(payload), config.jwtSecret, { expiresIn: CHECKOUT_EXPIRES_IN });
}

export function verifyRegistrationCheckoutToken(token: string, expected: {
  email: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  totalFee: number;
  paymentReference?: string;
}) {
  const decoded = jwt.verify(token, config.jwtSecret) as RegistrationCheckoutPayload & { purpose?: string };
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

export function bindPaymentReferenceToCheckoutToken(token: string, paymentReference: string) {
  const decoded = jwt.verify(token, config.jwtSecret) as RegistrationCheckoutPayload & { purpose?: string };
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

export function buildFeeBreakdown(klass: any, subject: any) {
  return calculateEnrollmentFee(klass?.feeAmount, subject?.feeAmount);
}

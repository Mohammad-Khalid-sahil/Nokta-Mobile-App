import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { createAccessToken, signJwt, stripJwtClaims } from './jwt';
import { bindPaymentReferenceToCheckoutToken, createRegistrationCheckoutToken } from '../services/registrationCheckoutService';

function testStripJwtClaims() {
  const cleaned = stripJwtClaims({
    userId: '1',
    role: 'student',
    exp: 9999999999,
    iat: 1,
    jti: 'old-id'
  });
  assert.equal(cleaned.userId, '1');
  assert.equal(cleaned.role, 'student');
  assert.equal('exp' in cleaned, false);
  assert.equal('iat' in cleaned, false);
  assert.equal('jti' in cleaned, false);
}

function testSignJwtWithExpiresInOnly() {
  const token = signJwt({ userId: 'abc', role: 'admin' }, config.jwtSecret, { expiresIn: '1h' });
  const decoded = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
  assert.equal(decoded.userId, 'abc');
  assert.ok(typeof decoded.exp === 'number');
  assert.ok(decoded.exp > Math.floor(Date.now() / 1000));
}

function testSignJwtRejectsSpreadVerifiedPayload() {
  const first = signJwt({ purpose: 'test', email: 'a@b.com' }, config.jwtSecret, { expiresIn: '45m' });
  const verified = jwt.verify(first, config.jwtSecret) as Record<string, unknown>;
  assert.doesNotThrow(() => {
    signJwt({ ...verified, email: 'a@b.com' }, config.jwtSecret, { expiresIn: '45m' });
  });
}

function testRegistrationCheckoutRebindDoesNotThrow() {
  const token = createRegistrationCheckoutToken({
    email: 'student@example.com',
    classId: 'class-1',
    subjectId: 'subject-1',
    teacherId: 'teacher-1',
    classFee: 100,
    subjectFee: 50,
    totalFee: 150,
    currency: 'AFN'
  });

  assert.doesNotThrow(() => {
    bindPaymentReferenceToCheckoutToken(token, 'TXN-123456');
  });

  const rebound = bindPaymentReferenceToCheckoutToken(token, 'TXN-123456');
  const decoded = jwt.verify(rebound, config.jwtSecret) as Record<string, unknown>;
  assert.equal(decoded.paymentReference, 'TXN-123456');
  assert.equal(decoded.email, 'student@example.com');
}

function testCreateAccessToken() {
  const token = createAccessToken(
    { _id: { toString: () => 'user-1' }, role: 'student', branchId: null },
    'student',
    'session-1'
  );
  const decoded = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
  assert.equal(decoded.userId, 'user-1');
  assert.equal(decoded.role, 'student');
}

export function runJwtTests() {
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

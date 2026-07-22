import type { Request } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config/env';

function resolveRequestIdentity(req: Request) {
  const userId = req.user?.userId;
  if (userId) {
    return `user:${userId}`;
  }

  const forwardedFor = req.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ipAddress = forwardedFor || req.ip || req.socket.remoteAddress || 'anonymous';
  return `ip:${ipAddress}`;
}

function createLimiter(params: {
  max: number;
  message: string;
  skip?: (req: Request) => boolean;
}) {
  return rateLimit({
    windowMs: config.rateLimitWindow * 60 * 1000,
    max: params.max,
    message: { success: false, message: params.message },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: resolveRequestIdentity,
    skip: (req) => req.method.toUpperCase() === 'OPTIONS' || params.skip?.(req) === true
  });
}

function isReadRequest(req: Request) {
  const method = req.method.toUpperCase();
  return method === 'GET' || method === 'HEAD';
}

function isWriteRequest(req: Request) {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase());
}

function isAuthRoute(req: Request) {
  return req.path.startsWith('/auth/');
}

export const apiReadLimiter = createLimiter({
  max: config.readRateLimitMax,
  message: 'Too many read requests, please wait a moment and try again.',
  skip: (req) => !isReadRequest(req) || req.path === '/health'
});

export const apiWriteLimiter = createLimiter({
  max: config.writeRateLimitMax,
  message: 'Too many write requests, please slow down and try again.',
  skip: (req) => !isWriteRequest(req) || isAuthRoute(req)
});

export const generalLimiter = apiReadLimiter;
export const writeLimiter = apiWriteLimiter;

export const authLimiter = rateLimit({
  windowMs: config.rateLimitWindow * 60 * 1000,
  max: config.authRateLimitMax,
  message: { success: false, message: 'Too many authentication attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: resolveRequestIdentity,
  skipSuccessfulRequests: true
});

export const publicContactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  message: { success: false, message: 'Too many contact requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: resolveRequestIdentity
});

export const teacherCreateLimiter = rateLimit({
  windowMs: config.rateLimitWindow * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many teacher creation attempts. Please wait a moment.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: resolveRequestIdentity,
  skipSuccessfulRequests: true
});

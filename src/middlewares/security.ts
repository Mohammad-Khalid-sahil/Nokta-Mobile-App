import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { config } from '../config/env';
import { createError } from '../helpers/response';
import { PermissionService } from '../services/permissionService';
import { sanitizePayload } from '../utils/requestSanitizer';

const permissionService = new PermissionService();

function parseCookieHeader(cookieHeader: string) {
  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, part) => {
      const separatorIndex = part.indexOf('=');
      if (separatorIndex <= 0) return acc;
      const key = part.slice(0, separatorIndex).trim();
      const value = decodeURIComponent(part.slice(separatorIndex + 1).trim());
      if (key) acc[key] = value;
      return acc;
    }, {});
}

function hasBearerAuthorization(req: Request) {
  const authorization = req.get('authorization') ?? '';
  return /^Bearer\s+\S+/i.test(authorization);
}

function isCsrfExemptRequest(req: Request) {
  if (hasBearerAuthorization(req)) {
    return true;
  }

  const pathname = req.originalUrl.split('?')[0];
  return permissionService.isPublicRoute(pathname, req.method);
}

export function requestContextMiddleware(req: Request, res: Response, next: NextFunction) {
  req.requestId = crypto.randomUUID();
  res.setHeader('x-request-id', req.requestId);
  next();
}

export function requestSanitizationMiddleware(req: Request, _res: Response, next: NextFunction) {
  req.body = sanitizePayload(req.body);
  req.query = sanitizePayload(req.query);
  req.params = sanitizePayload(req.params);
  next();
}

export function csrfProtectionMiddleware(req: Request, res: Response, next: NextFunction) {
  const stateChanging = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase());
  if (!stateChanging || !req.headers.cookie || isCsrfExemptRequest(req)) {
    if (!stateChanging && req.headers.cookie) {
      const cookies = parseCookieHeader(req.headers.cookie);
      const existingToken = cookies[config.csrfCookieName];
      if (!existingToken) {
        const token = crypto.randomBytes(32).toString('hex');
        res.cookie(config.csrfCookieName, token, {
          httpOnly: false,
          sameSite: 'lax',
          secure: config.environment === 'production',
          path: '/'
        });
      }
    }
    return next();
  }

  const csrfToken = req.get(config.csrfHeaderName);
  const cookies = parseCookieHeader(req.headers.cookie);
  const cookieToken = cookies[config.csrfCookieName];
  const cookieTokenMatch = Boolean(csrfToken && cookieToken && csrfToken === cookieToken);
  const legacySecretMatch = config.csrfAllowLegacySecret && Boolean(csrfToken && csrfToken === config.csrfSecret);

  if (!cookieTokenMatch && !legacySecretMatch) {
    return res.status(403).json(createError('CSRF token invalid'));
  }

  next();
}

import { Router, type NextFunction, type Request, type Response } from 'express';
import Joi from 'joi';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { config } from '../../config/env';
import { createError, createResponse } from '../../helpers/response';
import { AnalyticsEvent } from '../../models/AnalyticsEvent';
import { ClientErrorLog } from '../../models/ClientErrorLog';
import { validate } from '../../middlewares/validate';
import type { AuthPayload } from '../../middlewares/auth';
import { normalizeRole } from '../../utils/roleHelpers';

const router = Router();

const clientErrorSchema = Joi.object({
  body: Joi.object({
    message: Joi.string().trim().max(4000).required(),
    stacktrace: Joi.string().max(20000).allow('', null).optional(),
    stackTrace: Joi.string().max(20000).allow('', null).optional(),
    appVersion: Joi.string().trim().max(64).allow('', null).optional(),
    buildNumber: Joi.string().trim().max(32).allow('', null).optional(),
    platform: Joi.string().trim().max(64).allow('', null).optional(),
    platformVersion: Joi.string().trim().max(128).allow('', null).optional(),
    deviceId: Joi.string().trim().max(128).allow('', null).optional(),
    userId: Joi.string().hex().length(24).allow('', null).optional(),
    context: Joi.object().unknown(true).optional(),
    timestamp: Joi.alternatives().try(Joi.date(), Joi.string()).allow(null).optional()
  })
});

const analyticsEventSchema = Joi.object({
  body: Joi.object({
    name: Joi.string().trim().max(128).optional(),
    event: Joi.string().trim().max(128).optional(),
    parameters: Joi.object().unknown(true).optional(),
    metadata: Joi.object().unknown(true).optional(),
    context: Joi.object().unknown(true).optional(),
    timestamp: Joi.alternatives().try(Joi.date(), Joi.string()).allow(null).optional()
  }).or('name', 'event')
});

function resolveClientTimestamp(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function resolveUserId(req: Request, bodyUserId?: string | null) {
  if (req.user?.userId && mongoose.Types.ObjectId.isValid(req.user.userId)) {
    return new mongoose.Types.ObjectId(req.user.userId);
  }
  if (bodyUserId && mongoose.Types.ObjectId.isValid(bodyUserId)) {
    return new mongoose.Types.ObjectId(bodyUserId);
  }
  return null;
}

async function optionalAuthenticate(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, config.jwtSecret) as AuthPayload;
    if (payload.userId && mongoose.Types.ObjectId.isValid(payload.userId)) {
      const canonicalRole = normalizeRole(payload.canonicalRole ?? payload.role);
      req.user = {
        userId: payload.userId,
        role: payload.role,
        canonicalRole,
        branchId: payload.branchId ?? null,
        sessionId: payload.sessionId ?? payload.jti ?? null,
        permissionKeys: [],
        revokedPermissionKeys: [],
        permissions: {}
      };
    }
  } catch {
    // Ignore invalid tokens for observability ingestion.
  }
  next();
}

router.post('/client-errors', optionalAuthenticate, validate(clientErrorSchema), async (req, res, next) => {
  try {
    const body = req.body as Record<string, unknown>;
    const stacktrace = String(body.stacktrace ?? body.stackTrace ?? '').slice(0, 20000);
    const entry = await ClientErrorLog.create({
      message: String(body.message ?? '').slice(0, 4000),
      stacktrace,
      appVersion: body.appVersion ?? '',
      buildNumber: body.buildNumber ?? '',
      platform: body.platform ?? '',
      platformVersion: body.platformVersion ?? '',
      deviceId: body.deviceId ?? '',
      userId: resolveUserId(req, typeof body.userId === 'string' ? body.userId : null),
      context: body.context ?? {},
      clientTimestamp: resolveClientTimestamp(body.timestamp)
    });

    res.status(201).json(createResponse({ id: entry._id }, 'Client error logged'));
  } catch (error) {
    next(error);
  }
});

router.post('/analytics/event', optionalAuthenticate, validate(analyticsEventSchema), async (req, res, next) => {
  try {
    const body = req.body as Record<string, unknown>;
    const name = String(body.name ?? body.event ?? '').trim();
    if (!name) {
      return res.status(400).json(createError('Event name is required'));
    }

    const parameters = (body.parameters ?? body.metadata ?? {}) as Record<string, unknown>;
    const entry = await AnalyticsEvent.create({
      name,
      parameters,
      userId: resolveUserId(
        req,
        typeof (body.context as Record<string, unknown> | undefined)?.userId === 'string'
          ? String((body.context as Record<string, unknown>).userId)
          : null
      ),
      context: body.context ?? {},
      clientTimestamp: resolveClientTimestamp(body.timestamp)
    });

    res.status(201).json(createResponse({ id: entry._id }, 'Analytics event recorded'));
  } catch (error) {
    next(error);
  }
});

export const observabilityRouter = router;

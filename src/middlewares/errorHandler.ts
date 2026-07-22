import type { Request, Response, NextFunction } from 'express';
import { createError } from '../helpers/response';
import { resolveHttpMessage, resolveHttpStatus } from '../utils/httpErrors';
import { consoleMonitor } from '../utils/consoleMonitor';
import { resolveClientIp } from '../utils/networkAddresses';
import { logger } from '../utils/logger';

export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  const status = resolveHttpStatus(err);
  const message = resolveHttpMessage(err);
  const clientIp = resolveClientIp(req);
  const pathname = req.originalUrl.split('?')[0] ?? req.path;

  if (status >= 400) {
    consoleMonitor.apiError({
      method: req.method,
      path: pathname,
      statusCode: status,
      reason: message,
      clientIp
    });
  }

  if (status >= 500) {
    logger.error('Unhandled server error', err, {
      requestId: req.requestId ?? null,
      path: req.originalUrl,
      method: req.method,
      clientIp
    });
  } else if (status >= 400) {
    logger.warn('API client error', {
      requestId: req.requestId ?? null,
      path: req.originalUrl,
      method: req.method,
      status,
      message,
      clientIp
    });
  }

  res.status(status).json({ ...createError(message), requestId: req.requestId ?? null });
}

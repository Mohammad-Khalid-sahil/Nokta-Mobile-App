import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import path from 'path';
import { connectDatabase } from './database/connect';
import { config } from './config/env';
import { integrationConfig } from './config/integrations';
import { isOriginAllowed } from './constants/allowedOrigins';
import './models';
import { startAutomationJobs } from './jobs';
import { authenticate } from './middlewares/auth';
import { auditMiddleware } from './middlewares/audit';
import { branchMiddleware } from './middlewares/branch';
import { apiReadLimiter, apiWriteLimiter } from './middlewares/rateLimiter';
import { ownershipMiddleware } from './middlewares/ownership';
import { routePermissionMiddleware } from './middlewares/permission';
import { csrfProtectionMiddleware, requestContextMiddleware, requestSanitizationMiddleware } from './middlewares/security';
import { errorHandler } from './middlewares/errorHandler';
import { registerFrontendStatic } from './middlewares/serveFrontend';
import { requestMonitorMiddleware } from './middlewares/requestMonitor';
import { mobilePerformanceMiddleware } from './middlewares/mobilePerformance';
import { apiRouter } from './routes';
import { systemRouter } from './routes/system.routes';
import { PermissionService } from './services/permissionService';
import { logger } from './utils/logger';

const app = express();
const permissionService = new PermissionService();

app.set('trust proxy', integrationConfig.tls.trustProxy ? 1 : 0);

if (integrationConfig.tls.forceHttps) {
  app.use((req, res, next) => {
    if (
      req.path === '/health' ||
      req.path === '/health/ready' ||
      req.path === '/api/health' ||
      req.path === '/api/network'
    ) {
      return next();
    }
    const forwarded = req.header('x-forwarded-proto');
    if (req.secure || forwarded === 'https') {
      return next();
    }
    const host = req.get('host');
    if (!host) {
      return next();
    }
    return res.redirect(301, `https://${host}${req.originalUrl}`);
  });
}

const corsOptions = {
  origin: (origin: string | undefined | null, callback: (err: Error | null, allow?: boolean) => void) => {
    if (!origin) {
      return callback(null, true);
    }
    if (isOriginAllowed(origin, config.environment)) {
      return callback(null, true);
    }
    logger.warn('Blocked CORS origin', { origin });
    return callback(new Error(`CORS blocked: ${origin}`), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    config.csrfHeaderName,
    'x-device-id',
    'x-device-name',
    'Accept',
    'Origin',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers'
  ],
  exposedHeaders: ['Authorization', 'Content-Type'],
  preflightContinue: false,
  optionsSuccessStatus: 204
};

if (config.environment === 'development') {
  app.use((req, res, next) => {
    const startedAt = Date.now();
    const authorization = req.headers.authorization;
    console.log('[INCOMING REQUEST]', {
      method: req.method,
      path: req.originalUrl,
      ip: req.ip,
      authorizationPresent: Boolean(authorization),
      bearerTokenPresent:
        typeof authorization === 'string' && authorization.startsWith('Bearer ')
    });

    res.on('finish', () => {
      console.log('[REQUEST COMPLETED]', {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Date.now() - startedAt
      });
    });

    next();
  });
}

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  ...(integrationConfig.tls.forceHttps
    ? { hsts: { maxAge: integrationConfig.tls.hstsMaxAge, includeSubDomains: true } }
    : {})
}));

app.use(requestContextMiddleware);
app.use(express.json({ limit: config.bodyLimit }));
app.use(express.urlencoded({ extended: true, limit: config.bodyLimit }));
app.use(requestSanitizationMiddleware);
app.use(requestMonitorMiddleware);
app.use(csrfProtectionMiddleware);
app.use(compression());

app.get('/api/health', (_req, res) => {
  return res.status(200).json({
    success: true,
    message: 'Backend is reachable',
    data: {
      status: 'ok',
      timestamp: new Date().toISOString()
    }
  });
});

app.use('/uploads', (req, res, next) => {
  const origin = req.headers.origin;

  if (origin && isOriginAllowed(origin, config.environment)) {
    res.header('Access-Control-Allow-Origin', origin);
  }

  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  res.header('Cache-Control', 'public, max-age=86400');

  next();
}, express.static(path.join(__dirname, '../uploads')));

if (process.env.SERVE_FRONTEND === 'true') {
  registerFrontendStatic(app);
}

app.use(systemRouter);
app.use('/api', (req, res, next) => (
  permissionService.isPublicRoute(req.originalUrl, req.method)
    ? next()
    : authenticate(req, res, next)
));
app.use('/api', apiReadLimiter, apiWriteLimiter, routePermissionMiddleware, branchMiddleware, ownershipMiddleware, auditMiddleware, mobilePerformanceMiddleware, apiRouter);

if (process.env.SERVE_FRONTEND !== 'true') {
  registerFrontendStatic(app);
}

app.use('*', (req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

app.use(errorHandler);

export default app;

export async function createApp() {
  await connectDatabase();
  startAutomationJobs();
  return app;
}

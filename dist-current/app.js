"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const path_1 = __importDefault(require("path"));
const connect_1 = require("./database/connect");
const env_1 = require("./config/env");
const integrations_1 = require("./config/integrations");
const allowedOrigins_1 = require("./constants/allowedOrigins");
require("./models");
const jobs_1 = require("./jobs");
const auth_1 = require("./middlewares/auth");
const audit_1 = require("./middlewares/audit");
const branch_1 = require("./middlewares/branch");
const rateLimiter_1 = require("./middlewares/rateLimiter");
const ownership_1 = require("./middlewares/ownership");
const permission_1 = require("./middlewares/permission");
const security_1 = require("./middlewares/security");
const errorHandler_1 = require("./middlewares/errorHandler");
const serveFrontend_1 = require("./middlewares/serveFrontend");
const requestMonitor_1 = require("./middlewares/requestMonitor");
const mobilePerformance_1 = require("./middlewares/mobilePerformance");
const routes_1 = require("./routes");
const system_routes_1 = require("./routes/system.routes");
const permissionService_1 = require("./services/permissionService");
const logger_1 = require("./utils/logger");
const app = (0, express_1.default)();
const permissionService = new permissionService_1.PermissionService();
app.set('trust proxy', integrations_1.integrationConfig.tls.trustProxy ? 1 : 0);
if (integrations_1.integrationConfig.tls.forceHttps) {
    app.use((req, res, next) => {
        if (req.path === '/health' ||
            req.path === '/health/ready' ||
            req.path === '/api/health' ||
            req.path === '/api/network') {
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
    origin: (origin, callback) => {
        if (!origin) {
            return callback(null, true);
        }
        if ((0, allowedOrigins_1.isOriginAllowed)(origin, env_1.config.environment)) {
            return callback(null, true);
        }
        logger_1.logger.warn('Blocked CORS origin', { origin });
        return callback(new Error(`CORS blocked: ${origin}`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        env_1.config.csrfHeaderName,
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
app.use((0, cors_1.default)(corsOptions));
app.options('*', (0, cors_1.default)(corsOptions));
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    ...(integrations_1.integrationConfig.tls.forceHttps
        ? { hsts: { maxAge: integrations_1.integrationConfig.tls.hstsMaxAge, includeSubDomains: true } }
        : {})
}));
app.use(security_1.requestContextMiddleware);
app.use(express_1.default.json({ limit: env_1.config.bodyLimit }));
app.use(express_1.default.urlencoded({ extended: true, limit: env_1.config.bodyLimit }));
app.use(security_1.requestSanitizationMiddleware);
app.use(requestMonitor_1.requestMonitorMiddleware);
app.use(security_1.csrfProtectionMiddleware);
app.use((0, compression_1.default)());
app.use('/uploads', (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && (0, allowedOrigins_1.isOriginAllowed)(origin, env_1.config.environment)) {
        res.header('Access-Control-Allow-Origin', origin);
    }
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Cross-Origin-Resource-Policy', 'cross-origin');
    res.header('Cache-Control', 'public, max-age=86400');
    next();
}, express_1.default.static(path_1.default.join(__dirname, '../uploads')));
if (process.env.SERVE_FRONTEND === 'true') {
    (0, serveFrontend_1.registerFrontendStatic)(app);
}
app.use(system_routes_1.systemRouter);
app.use('/api', (req, res, next) => (permissionService.isPublicRoute(req.originalUrl, req.method)
    ? next()
    : (0, auth_1.authenticate)(req, res, next)));
app.use('/api', rateLimiter_1.apiReadLimiter, rateLimiter_1.apiWriteLimiter, permission_1.routePermissionMiddleware, branch_1.branchMiddleware, ownership_1.ownershipMiddleware, audit_1.auditMiddleware, mobilePerformance_1.mobilePerformanceMiddleware, routes_1.apiRouter);
if (process.env.SERVE_FRONTEND !== 'true') {
    (0, serveFrontend_1.registerFrontendStatic)(app);
}
app.use('*', (req, res) => {
    res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});
app.use(errorHandler_1.errorHandler);
exports.default = app;
async function createApp() {
    await (0, connect_1.connectDatabase)();
    (0, jobs_1.startAutomationJobs)();
    return app;
}

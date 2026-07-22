"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthCheck = healthCheck;
exports.networkInfo = networkInfo;
exports.readinessCheck = readinessCheck;
exports.internalDiagnostics = internalDiagnostics;
exports.getOpenApiSpec = getOpenApiSpec;
exports.getApiDocs = getApiDocs;
exports.getApiOverview = getApiOverview;
const mongoose_1 = __importDefault(require("mongoose"));
const path_1 = __importDefault(require("path"));
const env_1 = require("../config/env");
const integrations_1 = require("../config/integrations");
const logger_1 = require("../utils/logger");
const networkAddresses_1 = require("../utils/networkAddresses");
function databaseStatus() {
    const readyState = mongoose_1.default.connection.readyState;
    return {
        up: readyState === 1,
        readyState
    };
}
function environmentSanity() {
    const requiredSecrets = [
        { name: 'JWT secret', value: env_1.config.jwtSecret },
        { name: 'Refresh secret', value: env_1.config.refreshSecret },
        { name: 'CSRF secret', value: env_1.config.csrfSecret }
    ];
    const weakSecrets = requiredSecrets
        .filter((item) => typeof item.value !== 'string' || item.value.length < 32)
        .map((item) => item.name);
    return {
        up: weakSecrets.length === 0,
        weakSecrets
    };
}
function providerConfigStatus() {
    const stripeEnabled = env_1.config.paymentProvider === 'stripe';
    const stripeConfigured = Boolean(env_1.config.stripeSecretKey && env_1.config.stripeWebhookSecret);
    return {
        paymentProvider: env_1.config.paymentProvider,
        up: !stripeEnabled || stripeConfigured
    };
}
function resolveAppVersion() {
    return process.env.APP_VERSION || process.env.npm_package_version || '1.0.0';
}
function healthCheck(_req, res) {
    const database = databaseStatus();
    const env = environmentSanity();
    const providers = providerConfigStatus();
    const uptimeSeconds = Math.floor(process.uptime());
    res.status(200).json({
        success: true,
        ok: true,
        status: 'ok',
        message: 'Backend is reachable',
        service: 'nokta-academy-backend',
        version: resolveAppVersion(),
        port: env_1.config.port,
        environment: env_1.config.environment,
        network: (0, networkAddresses_1.getNetworkAccessInfo)(env_1.config.port),
        uptimeSeconds,
        timestamp: new Date().toISOString(),
        checks: {
            database: database.up ? 'up' : 'unknown',
            env: env.up ? 'up' : 'degraded',
            providers: providers.up ? 'up' : 'degraded'
        }
    });
}
function networkInfo(_req, res) {
    res.status(200).json({
        ok: true,
        status: 'ok',
        service: 'nokta-academy-backend',
        network: (0, networkAddresses_1.getNetworkAccessInfo)(env_1.config.port),
        timestamp: new Date().toISOString()
    });
}
function integrationsStatus() {
    const readiness = (0, integrations_1.getIntegrationsReadiness)();
    return {
        up: readiness.ok,
        ...readiness
    };
}
function readinessCheck(_req, res) {
    const database = databaseStatus();
    const env = environmentSanity();
    const providers = providerConfigStatus();
    const integrations = integrationsStatus();
    const ready = database.up && env.up && providers.up && integrations.up;
    const memory = process.memoryUsage();
    res.status(ready ? 200 : 503).json({
        status: ready ? 'ready' : 'not_ready',
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.floor(process.uptime()),
        version: resolveAppVersion(),
        memory: {
            rss: memory.rss,
            heapUsed: memory.heapUsed
        },
        checks: {
            database: database.up ? 'up' : 'down',
            env: env.up ? 'up' : 'down',
            providers: providers.up ? 'up' : 'down',
            integrations: integrations.up ? 'up' : 'down'
        },
        integrations: {
            strict: integrations_1.integrationConfig.strictProduction,
            issues: integrations.issues,
            email: integrations.email,
            sms: integrations.sms,
            stripe: integrations.stripe,
            ai: integrations.ai
        }
    });
}
function internalDiagnostics(req, res) {
    const database = databaseStatus();
    const env = environmentSanity();
    const providers = providerConfigStatus();
    const integrations = integrationsStatus();
    const memory = process.memoryUsage();
    logger_1.logger.info('Internal diagnostics requested', {
        requestId: req.requestId ?? null,
        role: req.user?.canonicalRole ?? req.user?.role ?? null,
        userId: req.user?.userId ?? null
    });
    res.status(200).json({
        status: 'ok',
        service: 'nokta-academy-backend',
        environment: env_1.config.environment,
        version: resolveAppVersion(),
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        checks: {
            database,
            env,
            providers,
            integrations
        },
        runtime: {
            nodeVersion: process.version,
            pid: process.pid,
            memory
        }
    });
}
function getOpenApiSpec(_req, res) {
    res.sendFile(path_1.default.join(__dirname, '../../openapi/openapi.json'));
}
function getApiDocs(_req, res) {
    res.type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Nokta Academy API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js"></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: '/openapi.json',
      dom_id: '#swagger-ui',
      deepLinking: true,
      persistAuthorization: true
    });
  </script>
</body>
</html>`);
}
function getApiOverview(req, res) {
    res.json({
        message: 'Nokta Academy Backend API',
        version: '1.0.0',
        status: 'running',
        network: (0, networkAddresses_1.getNetworkAccessInfo)(env_1.config.port),
        endpoints: {
            health: '/health',
            readiness: '/health/ready',
            openApi: '/openapi.json',
            docs: '/api-docs',
            auth: '/api/auth',
            users: '/api/users',
            branches: '/api/branches',
            students: '/api/students',
            teachers: '/api/teachers',
            classes: '/api/classes',
            subjects: '/api/subjects',
            attendance: '/api/attendance',
            exams: '/api/exams',
            results: '/api/results',
            payments: '/api/payments',
            finance: '/api/finance',
            expenses: '/api/expenses',
            families: '/api/families',
            books: '/api/books',
            audit: '/api/audit',
            notifications: '/api/notifications',
            roles: '/api/roles',
            permissions: '/api/permissions',
            dashboard: '/api/dashboard',
            reports: '/api/reports',
            languageSettings: '/api/language-settings',
            admin: '/api/admin'
        }
    });
}

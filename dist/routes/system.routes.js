"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.systemRouter = void 0;
const express_1 = require("express");
const system_controller_1 = require("../controllers/system.controller");
const auth_1 = require("../middlewares/auth");
exports.systemRouter = (0, express_1.Router)();
exports.systemRouter.get('/health', system_controller_1.healthCheck);
exports.systemRouter.get('/health/ready', system_controller_1.readinessCheck);
exports.systemRouter.get('/health/internal', auth_1.authenticate, (0, auth_1.authorize)(['super_admin', 'owner', 'admin']), system_controller_1.internalDiagnostics);
exports.systemRouter.get('/api/health', system_controller_1.healthCheck);
exports.systemRouter.get('/api/network', system_controller_1.networkInfo);
exports.systemRouter.get('/openapi.json', system_controller_1.getOpenApiSpec);
exports.systemRouter.get('/api-docs', system_controller_1.getApiDocs);
// Desktop app loads the UI at /. Keep JSON API overview on a separate path.
if (process.env.SERVE_FRONTEND !== 'true') {
    exports.systemRouter.get('/', system_controller_1.getApiOverview);
}
exports.systemRouter.get('/api-info', system_controller_1.getApiOverview);

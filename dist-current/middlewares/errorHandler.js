"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
const response_1 = require("../helpers/response");
const httpErrors_1 = require("../utils/httpErrors");
const consoleMonitor_1 = require("../utils/consoleMonitor");
const networkAddresses_1 = require("../utils/networkAddresses");
const logger_1 = require("../utils/logger");
function errorHandler(err, req, res, next) {
    const status = (0, httpErrors_1.resolveHttpStatus)(err);
    const message = (0, httpErrors_1.resolveHttpMessage)(err);
    const clientIp = (0, networkAddresses_1.resolveClientIp)(req);
    const pathname = req.originalUrl.split('?')[0] ?? req.path;
    if (status >= 400) {
        consoleMonitor_1.consoleMonitor.apiError({
            method: req.method,
            path: pathname,
            statusCode: status,
            reason: message,
            clientIp
        });
    }
    if (status >= 500) {
        logger_1.logger.error('Unhandled server error', err, {
            requestId: req.requestId ?? null,
            path: req.originalUrl,
            method: req.method,
            clientIp
        });
    }
    else if (status >= 400) {
        logger_1.logger.warn('API client error', {
            requestId: req.requestId ?? null,
            path: req.originalUrl,
            method: req.method,
            status,
            message,
            clientIp
        });
    }
    res.status(status).json({ ...(0, response_1.createError)(message), requestId: req.requestId ?? null });
}

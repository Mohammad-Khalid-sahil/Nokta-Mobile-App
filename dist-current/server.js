"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const app_1 = require("./app");
const env_1 = require("./config/env");
const integrations_1 = require("./config/integrations");
const connect_1 = require("./database/connect");
const consoleMonitor_1 = require("./utils/consoleMonitor");
const networkAddresses_1 = require("./utils/networkAddresses");
const logger_1 = require("./utils/logger");
let server = null;
let shuttingDown = false;
async function shutdown(signal) {
    if (shuttingDown) {
        return;
    }
    shuttingDown = true;
    logger_1.logger.info('Shutdown signal received', { signal });
    try {
        if (server) {
            await new Promise((resolve, reject) => {
                server?.close((error) => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    resolve();
                });
            });
        }
        await (0, connect_1.disconnectDatabase)();
        logger_1.logger.info('Graceful shutdown completed');
        process.exit(0);
    }
    catch (error) {
        logger_1.logger.error('Error during graceful shutdown', error);
        process.exit(1);
    }
}
async function start() {
    const app = await (0, app_1.createApp)();
    server = app.listen(env_1.config.port, env_1.config.host, () => {
        const integrations = (0, integrations_1.getIntegrationsReadiness)();
        const lanIp = (0, networkAddresses_1.getPrimaryLanIPv4)();
        const mobileApiUrl = lanIp ? (0, networkAddresses_1.buildApiBaseUrl)(lanIp, env_1.config.port) : null;
        logger_1.logger.info('Backend server started', {
            host: env_1.config.host,
            port: env_1.config.port,
            environment: env_1.config.environment,
            lanIp,
            mobileApiUrl,
            database: mongoose_1.default.connection.readyState === 1 ? 'connected' : 'disconnected',
            integrations: {
                email: integrations.email.mode,
                sms: integrations.sms.mode,
                stripe: integrations.stripe,
                ai: integrations.ai,
                strict: integrations_1.integrationConfig.strictProduction,
                issues: integrations.issues
            }
        });
        consoleMonitor_1.consoleMonitor.startup({
            port: env_1.config.port,
            host: env_1.config.host,
            environment: env_1.config.environment,
            databaseConnected: mongoose_1.default.connection.readyState === 1,
            databaseName: mongoose_1.default.connection.name || undefined
        });
    });
}
start().catch((error) => {
    logger_1.logger.error('Server startup failed', error);
    process.exit(1);
});
process.on('SIGINT', () => {
    void shutdown('SIGINT');
});
process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
});

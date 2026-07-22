import type { Server } from 'node:http';
import mongoose from 'mongoose';
import { createApp } from './app';
import { config } from './config/env';
import { getIntegrationsReadiness, integrationConfig } from './config/integrations';
import { disconnectDatabase } from './database/connect';
import { consoleMonitor } from './utils/consoleMonitor';
import { buildApiBaseUrl, getPrimaryLanIPv4 } from './utils/networkAddresses';
import { logger } from './utils/logger';

let server: Server | null = null;
let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  logger.info('Shutdown signal received', { signal });

  try {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server?.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }

    await disconnectDatabase();
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown', error);
    process.exit(1);
  }
}

async function start() {
  const app = await createApp();
  server = app.listen(config.port, config.host, () => {
    if (server) {
      server.keepAliveTimeout = 65_000;
      server.headersTimeout = 66_000;
      server.requestTimeout = 120_000;
    }

    const integrations = getIntegrationsReadiness();
    const lanIp = getPrimaryLanIPv4();
    const mobileApiUrl = lanIp ? buildApiBaseUrl(lanIp, config.port) : null;

    logger.info('Backend server started', {
      host: config.host,
      port: config.port,
      environment: config.environment,
      lanIp,
      mobileApiUrl,
      database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      integrations: {
        email: integrations.email.mode,
        sms: integrations.sms.mode,
        stripe: integrations.stripe,
        ai: integrations.ai,
        strict: integrationConfig.strictProduction,
        issues: integrations.issues
      }
    });

    consoleMonitor.startup({
      port: config.port,
      host: config.host,
      environment: config.environment,
      databaseConnected: mongoose.connection.readyState === 1,
      databaseName: mongoose.connection.name || undefined
    });
  });
}

start().catch((error) => {
  logger.error('Server startup failed', error);
  process.exit(1);
});

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

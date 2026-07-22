import { config } from '../config/env';
import { buildApiBaseUrl, getLanIPv4Addresses, getPrimaryLanIPv4 } from './networkAddresses';

const divider = '====================================';

function timestamp() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function isEnabled() {
  return config.environment !== 'test';
}

/** Human-readable operational dashboard output (JSON logger remains unchanged). */
export const consoleMonitor = {
  startup(options: {
    port: number;
    host: string;
    environment: string;
    databaseConnected: boolean;
    databaseName?: string;
  }) {
    if (!isEnabled()) return;

    const lanIps = getLanIPv4Addresses();
    const primaryLan = getPrimaryLanIPv4();
    const mobileHost = primaryLan ?? lanIps[0] ?? options.host;
    const mobileApiUrl = buildApiBaseUrl(mobileHost, options.port);
    const localApiUrl = buildApiBaseUrl('127.0.0.1', options.port);

    console.log('');
    console.log(divider);
    console.log('SERVER STARTED SUCCESSFULLY');
    console.log(divider);
    console.log('');
    console.log(`Host bind: ${options.host}`);
    console.log(`Port: ${options.port}`);
    console.log(`Environment: ${options.environment}`);
    console.log('');
    console.log('Network diagnostics:');
    console.log(`  ✓ Server Port: ${options.port}`);
    console.log(`  ✓ Server IP (LAN): ${primaryLan ?? 'not detected — check Wi-Fi/Ethernet'}`);
    if (lanIps.length > 1) {
      console.log(`  ✓ All LAN IPs: ${lanIps.join(', ')}`);
    }
    console.log(`  ✓ API URL (local): ${localApiUrl}`);
    console.log(`  ✓ Mobile Access URL: ${mobileApiUrl}`);
    console.log(`  ✓ Database: ${options.databaseConnected ? 'Connected' : 'Disconnected'}${options.databaseName ? ` (${options.databaseName})` : ''}`);
    console.log(`  ✓ Server: Running`);
    console.log('');
    console.log('Use this URL on physical phones (same Wi-Fi):');
    console.log(`  ${mobileApiUrl}`);
    console.log('');
    console.log(divider);
    console.log('');
  },

  request(options: {
    method: string;
    path: string;
    clientIp: string;
    statusCode: number;
    durationMs: number;
  }) {
    if (!isEnabled()) return;

    console.log(`[${timestamp()}]`);
    console.log(`${options.method} ${options.path}`);
    console.log(`Client: ${options.clientIp}`);
    console.log(`Status: ${options.statusCode}`);
    console.log(`Duration: ${options.durationMs}ms`);
    console.log('');
  },

  mobile(title: string, details: Record<string, string | number | undefined>) {
    if (!isEnabled()) return;

    console.log('[MOBILE]');
    console.log(title);
    for (const [key, value] of Object.entries(details)) {
      if (value !== undefined && value !== '') {
        const label = key.charAt(0).toUpperCase() + key.slice(1);
        console.log(`${label}: ${value}`);
      }
    }
    console.log('');
  },

  apiError(options: {
    method: string;
    path: string;
    statusCode: number;
    reason: string;
    clientIp: string;
  }) {
    if (!isEnabled()) return;

    console.log('ERROR');
    console.log(`${options.method} ${options.path}`);
    console.log('');
    console.log(`Status: ${options.statusCode}`);
    console.log('');
    console.log('Reason:');
    console.log(options.reason);
    console.log('');
    console.log('Client:');
    console.log(options.clientIp);
    console.log('');
  },

  database(options: {
    operation: 'INSERT' | 'UPDATE' | 'DELETE';
    collection: string;
    recordId?: string;
    actor?: string;
    detail?: string;
  }) {
    if (!isEnabled()) return;

    console.log('DATABASE');
    console.log('');
    console.log(options.operation);
    console.log('');
    console.log('Table:');
    console.log(options.collection);
    if (options.recordId) {
      console.log('');
      console.log('Record ID:');
      console.log(options.recordId);
    }
    if (options.detail) {
      console.log('');
      console.log('Detail:');
      console.log(options.detail);
    }
    console.log('');
    console.log('User:');
    console.log(options.actor ?? 'system');
    console.log('');
  }
};

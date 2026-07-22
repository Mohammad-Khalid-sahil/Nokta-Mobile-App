"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.consoleMonitor = void 0;
const env_1 = require("../config/env");
const networkAddresses_1 = require("./networkAddresses");
const divider = '====================================';
function timestamp() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}
function isEnabled() {
    return env_1.config.environment !== 'test';
}
/** Human-readable operational dashboard output (JSON logger remains unchanged). */
exports.consoleMonitor = {
    startup(options) {
        if (!isEnabled())
            return;
        const lanIps = (0, networkAddresses_1.getLanIPv4Addresses)();
        const primaryLan = (0, networkAddresses_1.getPrimaryLanIPv4)();
        const mobileHost = primaryLan ?? lanIps[0] ?? options.host;
        const mobileApiUrl = (0, networkAddresses_1.buildApiBaseUrl)(mobileHost, options.port);
        const localApiUrl = (0, networkAddresses_1.buildApiBaseUrl)('127.0.0.1', options.port);
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
    request(options) {
        if (!isEnabled())
            return;
        console.log(`[${timestamp()}]`);
        console.log(`${options.method} ${options.path}`);
        console.log(`Client: ${options.clientIp}`);
        console.log(`Status: ${options.statusCode}`);
        console.log(`Duration: ${options.durationMs}ms`);
        console.log('');
    },
    mobile(title, details) {
        if (!isEnabled())
            return;
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
    apiError(options) {
        if (!isEnabled())
            return;
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
    database(options) {
        if (!isEnabled())
            return;
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

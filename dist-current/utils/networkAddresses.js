"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLanIPv4Addresses = getLanIPv4Addresses;
exports.getPrimaryLanIPv4 = getPrimaryLanIPv4;
exports.getNetworkAccessInfo = getNetworkAccessInfo;
exports.resolveClientIp = resolveClientIp;
exports.buildApiBaseUrl = buildApiBaseUrl;
const node_os_1 = __importDefault(require("node:os"));
/** Collect non-loopback IPv4 addresses for mobile / LAN access. */
function getLanIPv4Addresses() {
    const interfaces = node_os_1.default.networkInterfaces();
    const addresses = new Set();
    for (const entries of Object.values(interfaces)) {
        if (!entries)
            continue;
        for (const entry of entries) {
            if (entry.family !== 'IPv4' || entry.internal)
                continue;
            const ip = entry.address.trim();
            if (!ip || ip.startsWith('169.254.'))
                continue;
            addresses.add(ip);
        }
    }
    return [...addresses].sort();
}
function getPrimaryLanIPv4() {
    const all = getLanIPv4Addresses();
    const preferred = all.find((ip) => ip.startsWith('192.168.')) ?? all.find((ip) => ip.startsWith('10.'));
    return preferred ?? all[0] ?? null;
}
function getNetworkAccessInfo(port) {
    const lanAddresses = getLanIPv4Addresses();
    return {
        host: '0.0.0.0',
        port,
        lanAddresses,
        primaryLanIp: getPrimaryLanIPv4(),
        apiBaseUrls: lanAddresses.map((ip) => buildApiBaseUrl(ip, port)),
        serverBaseUrls: lanAddresses.map((ip) => buildApiBaseUrl(ip, port, false)),
        hotspotHints: [
            buildApiBaseUrl('192.168.43.1', port),
            buildApiBaseUrl('192.168.137.1', port),
            buildApiBaseUrl('172.20.10.1', port),
            buildApiBaseUrl('10.0.0.1', port)
        ]
    };
}
function resolveClientIp(req) {
    const forwarded = req.headers?.['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
        return forwarded.split(',')[0]?.trim() ?? 'unknown';
    }
    return req.ip || req.socket?.remoteAddress || 'unknown';
}
function buildApiBaseUrl(host, port, includeApiPath = true) {
    const base = `http://${host}:${port}`;
    return includeApiPath ? `${base}/api` : base;
}

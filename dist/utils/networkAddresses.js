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
const ignoredInterfaceNamePattern = /(vpn|virtual|vmware|virtualbox|hyper-v|wsl|docker|loopback|tunnel|tap|tun|teredo|isatap|bluetooth)/i;
const preferredInterfaceNamePattern = /(wi-?fi|wireless|wlan|ethernet|lan)/i;
function isUsableLanAddress(ip) {
    return Boolean(ip) &&
        !ip.startsWith('127.') &&
        !ip.startsWith('169.254.');
}
function interfacePriority(name, ip) {
    if (ignoredInterfaceNamePattern.test(name))
        return -1;
    if (preferredInterfaceNamePattern.test(name))
        return 0;
    if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.'))
        return 1;
    return 2;
}
function getLanAddressEntries() {
    const interfaces = node_os_1.default.networkInterfaces();
    const addresses = new Map();
    for (const [name, entries] of Object.entries(interfaces)) {
        if (!entries)
            continue;
        for (const entry of entries) {
            if (entry.family !== 'IPv4' || entry.internal)
                continue;
            const ip = entry.address.trim();
            if (!isUsableLanAddress(ip))
                continue;
            const priority = interfacePriority(name, ip);
            if (priority < 0)
                continue;
            const existing = addresses.get(ip);
            if (!existing || priority < existing.priority) {
                addresses.set(ip, { name, address: ip, priority });
            }
        }
    }
    return [...addresses.values()].sort((left, right) => {
        if (left.priority !== right.priority)
            return left.priority - right.priority;
        return left.address.localeCompare(right.address);
    });
}
/** Collect non-loopback IPv4 addresses for mobile / LAN access. */
function getLanIPv4Addresses() {
    return getLanAddressEntries().map((entry) => entry.address);
}
function getPrimaryLanIPv4() {
    return getLanAddressEntries()[0]?.address ?? null;
}
function getNetworkAccessInfo(port) {
    const lanAddressEntries = getLanAddressEntries();
    const lanAddresses = lanAddressEntries.map((entry) => entry.address);
    return {
        host: '0.0.0.0',
        port,
        interfaces: lanAddressEntries.map(({ name, address }) => ({ name, address })),
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

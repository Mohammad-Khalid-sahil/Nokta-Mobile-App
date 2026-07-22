"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isMobileClient = isMobileClient;
exports.requestMonitorMiddleware = requestMonitorMiddleware;
const consoleMonitor_1 = require("../utils/consoleMonitor");
const networkAddresses_1 = require("../utils/networkAddresses");
const requestContextStore_1 = require("../utils/requestContextStore");
function shouldMonitor(pathname) {
    if (pathname.startsWith('/uploads/'))
        return false;
    if (/\.(js|css|png|jpe?g|gif|webp|svg|ico|woff2?|map)$/i.test(pathname))
        return false;
    return pathname.startsWith('/api') || pathname.startsWith('/health');
}
function shouldSkipVerboseMobileLog(req, pathname) {
    return process.env.MOBILE_VERBOSE_LOGS !== 'true' &&
        req.method === 'GET' &&
        pathname.startsWith('/api/mobile/');
}
function isMobileClient(req) {
    const deviceId = String(req.get('x-device-id') ?? '').toLowerCase();
    const deviceName = String(req.get('x-device-name') ?? '').toLowerCase();
    return deviceId.includes('nokta-flutter') || deviceId.includes('flutter-mobile') || deviceName.includes('flutter');
}
function resolveActor(req) {
    if (req.user?.userId) {
        return `${req.user.role ?? 'user'}:${req.user.userId}`;
    }
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    if (email)
        return email;
    return 'anonymous';
}
function resolveMobileActivity(method, pathname) {
    const path = pathname.split('?')[0];
    if (method === 'POST' && path === '/api/auth/login')
        return 'User Login Attempt';
    if (method === 'GET' && path === '/api/classes/public/home')
        return 'Class List Requested';
    if (method === 'GET' && path === '/api/courses/public/home')
        return 'Course List Requested';
    if (method === 'GET' && /^\/api\/classes\/public\/[^/]+$/.test(path))
        return 'Class Details Requested';
    if (method === 'GET' && /^\/api\/courses\/public\/[^/]+$/.test(path))
        return 'Course Details Requested';
    if (method === 'GET' && path.startsWith('/api/dashboard'))
        return 'Dashboard Data Requested';
    if (method === 'POST' && path.includes('/register'))
        return 'Student Registration Submitted';
    if (method === 'POST' && path === '/api/auth/register')
        return 'Student Registration Submitted';
    if (method === 'GET' && path.startsWith('/api/students'))
        return 'Students Data Requested';
    if (method === 'GET' && path.startsWith('/api/classes'))
        return 'Classes Data Requested';
    if (method === 'GET' && path.startsWith('/api/courses'))
        return 'Courses Data Requested';
    if (method === 'GET' && path.startsWith('/api/notifications'))
        return 'Notifications Requested';
    return null;
}
function logMobileActivity(req, statusCode, activity) {
    if (!isMobileClient(req) || !activity)
        return;
    const clientIp = (0, networkAddresses_1.resolveClientIp)(req);
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : undefined;
    const actor = resolveActor(req);
    if (activity === 'User Login Attempt') {
        if (statusCode >= 200 && statusCode < 300) {
            consoleMonitor_1.consoleMonitor.mobile('User Login Success', {
                user: email ?? actor,
                ip: clientIp,
                status: statusCode
            });
            return;
        }
        if (statusCode === 401 || statusCode === 403) {
            consoleMonitor_1.consoleMonitor.mobile('User Login Failed', {
                user: email ?? actor,
                ip: clientIp,
                status: statusCode
            });
            return;
        }
    }
    const outcome = statusCode >= 200 && statusCode < 400 ? 'Success' : 'Failed';
    consoleMonitor_1.consoleMonitor.mobile(`${activity} — ${outcome}`, {
        user: actor,
        ip: clientIp,
        status: statusCode
    });
}
function requestMonitorMiddleware(req, res, next) {
    const pathname = req.originalUrl.split('?')[0] ?? req.path;
    if (!shouldMonitor(pathname)) {
        return next();
    }
    const clientIp = (0, networkAddresses_1.resolveClientIp)(req);
    const startedAt = Date.now();
    const mobileActivity = isMobileClient(req) ? resolveMobileActivity(req.method, pathname) : null;
    const skipVerboseMobileLog = shouldSkipVerboseMobileLog(req, pathname);
    if (mobileActivity === 'User Login Attempt') {
        const email = typeof req.body?.email === 'string' ? req.body.email.trim() : undefined;
        consoleMonitor_1.consoleMonitor.mobile('User Login Attempt', {
            user: email ?? 'unknown',
            ip: clientIp
        });
    }
    requestContextStore_1.requestMonitorStore.run({ clientIp, actor: 'anonymous' }, () => {
        res.on('finish', () => {
            const durationMs = Date.now() - startedAt;
            const actor = resolveActor(req);
            (0, requestContextStore_1.setMonitorActor)(actor);
            if (!skipVerboseMobileLog) {
                consoleMonitor_1.consoleMonitor.request({
                    method: req.method,
                    path: pathname,
                    clientIp,
                    statusCode: res.statusCode,
                    durationMs
                });
            }
            if (!skipVerboseMobileLog) {
                logMobileActivity(req, res.statusCode, mobileActivity);
            }
        });
        next();
    });
}

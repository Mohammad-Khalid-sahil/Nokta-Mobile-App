"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mobilePerformanceMiddleware = mobilePerformanceMiddleware;
const mobileCache = new Map();
const mobileCacheTtlMs = Number(process.env.MOBILE_RESPONSE_CACHE_TTL_MS ?? 8000);
function isCacheableMobileGet(req) {
    return req.method === 'GET' && req.originalUrl.startsWith('/api/mobile/');
}
function cacheKey(req) {
    return `${req.user?.userId ?? 'anonymous'}:${req.originalUrl}`;
}
function mobilePerformanceMiddleware(req, res, next) {
    const startedAt = Date.now();
    res.setHeader('X-Backend-Node', 'nokta-academy');
    const originalJson = res.json.bind(res);
    function sendJson(body) {
        res.setHeader('X-Response-Time-Ms', String(Date.now() - startedAt));
        return originalJson(body);
    }
    if (!isCacheableMobileGet(req)) {
        res.json = sendJson;
        return next();
    }
    const key = cacheKey(req);
    const cached = mobileCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
        res.setHeader('X-Response-Cache', 'HIT');
        res.setHeader('X-Response-Time-Ms', String(Date.now() - startedAt));
        return res.status(cached.statusCode).json(cached.body);
    }
    res.json = (body) => {
        const duration = Date.now() - startedAt;
        res.setHeader('X-Response-Cache', 'MISS');
        res.setHeader('X-Response-Time-Ms', String(duration));
        if (res.statusCode >= 200 && res.statusCode < 300) {
            mobileCache.set(key, {
                body,
                statusCode: res.statusCode,
                expiresAt: Date.now() + mobileCacheTtlMs
            });
        }
        return originalJson(body);
    };
    return next();
}

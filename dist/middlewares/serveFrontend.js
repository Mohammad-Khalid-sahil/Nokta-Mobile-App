"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFrontendStatic = registerFrontendStatic;
const express_1 = __importDefault(require("express"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
function resolveFrontendDist() {
    const configured = process.env.FRONTEND_DIST?.trim();
    if (configured && fs_1.default.existsSync(configured)) {
        return configured;
    }
    const candidates = [
        path_1.default.resolve(process.cwd(), 'frontend', 'dist'),
        path_1.default.resolve(process.cwd(), '..', 'frontend', 'dist'),
        path_1.default.resolve(__dirname, '../../frontend/dist'),
        path_1.default.resolve(__dirname, '../../../frontend/dist'),
        path_1.default.resolve(String(process.resourcesPath ?? ''), 'frontend', 'dist')
    ].filter((candidate) => candidate.length > 0 && candidate !== path_1.default.resolve('', 'frontend', 'dist'));
    return candidates.find((candidate) => fs_1.default.existsSync(path_1.default.join(candidate, 'index.html')));
}
function registerFrontendStatic(app) {
    if (process.env.SERVE_FRONTEND !== 'true') {
        return;
    }
    const frontendDist = resolveFrontendDist();
    if (!frontendDist) {
        console.warn('[desktop] SERVE_FRONTEND is enabled but frontend dist was not found.');
        return;
    }
    console.log(`[desktop] Serving frontend from ${frontendDist}`);
    app.use(express_1.default.static(frontendDist, { index: false }));
    app.get('/', (_req, res) => {
        res.sendFile(path_1.default.join(frontendDist, 'index.html'));
    });
    app.get('*', (req, res, next) => {
        if (req.method !== 'GET' ||
            req.path.startsWith('/api') ||
            req.path.startsWith('/uploads') ||
            req.path === '/health' ||
            req.path === '/api-info') {
            return next();
        }
        res.sendFile(path_1.default.join(frontendDist, 'index.html'));
    });
}

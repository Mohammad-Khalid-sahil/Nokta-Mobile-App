import express, { type Express } from 'express';
import fs from 'fs';
import path from 'path';

function resolveFrontendDist() {
  const configured = process.env.FRONTEND_DIST?.trim();
  if (configured && fs.existsSync(configured)) {
    return configured;
  }

  const candidates = [
    path.resolve(process.cwd(), 'frontend', 'dist'),
    path.resolve(process.cwd(), '..', 'frontend', 'dist'),
    path.resolve(__dirname, '../../frontend/dist'),
    path.resolve(__dirname, '../../../frontend/dist'),
    path.resolve(String((process as NodeJS.Process & { resourcesPath?: string }).resourcesPath ?? ''), 'frontend', 'dist')
  ].filter((candidate) => candidate.length > 0 && candidate !== path.resolve('', 'frontend', 'dist'));

  return candidates.find((candidate) => fs.existsSync(path.join(candidate, 'index.html')));
}

export function registerFrontendStatic(app: Express) {
  if (process.env.SERVE_FRONTEND !== 'true') {
    return;
  }

  const frontendDist = resolveFrontendDist();
  if (!frontendDist) {
    console.warn('[desktop] SERVE_FRONTEND is enabled but frontend dist was not found.');
    return;
  }

  console.log(`[desktop] Serving frontend from ${frontendDist}`);

  app.use(express.static(frontendDist, { index: false }));

  app.get('/', (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });

  app.get('*', (req, res, next) => {
    if (
      req.method !== 'GET' ||
      req.path.startsWith('/api') ||
      req.path.startsWith('/uploads') ||
      req.path === '/health' ||
      req.path === '/api-info'
    ) {
      return next();
    }

    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

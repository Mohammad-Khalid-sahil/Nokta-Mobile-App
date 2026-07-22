import { Router } from 'express';
import {
  getApiDocs,
  getApiOverview,
  getOpenApiSpec,
  healthCheck,
  internalDiagnostics,
  networkInfo,
  readinessCheck
} from '../controllers/system.controller';
import { authenticate, authorize } from '../middlewares/auth';

export const systemRouter = Router();

systemRouter.get('/health', healthCheck);
systemRouter.get('/health/ready', readinessCheck);
systemRouter.get('/health/internal', authenticate, authorize(['super_admin', 'owner', 'admin']), internalDiagnostics);
systemRouter.get('/api/health', healthCheck);
systemRouter.get('/api/network', networkInfo);
systemRouter.get('/openapi.json', getOpenApiSpec);
systemRouter.get('/api-docs', getApiDocs);

// Desktop app loads the UI at /. Keep JSON API overview on a separate path.
if (process.env.SERVE_FRONTEND !== 'true') {
  systemRouter.get('/', getApiOverview);
}
systemRouter.get('/api-info', getApiOverview);

import { getIntegrationsReadiness, integrationConfig } from '../config/integrations';

const readiness = getIntegrationsReadiness();

console.log('Integrations readiness');
console.log(JSON.stringify(readiness, null, 2));

if (integrationConfig.strictProduction && !readiness.ok) {
  console.error('Strict production integrations check failed.');
  process.exit(1);
}

console.log('Integrations validation passed (non-strict or all configured).');
process.exit(0);

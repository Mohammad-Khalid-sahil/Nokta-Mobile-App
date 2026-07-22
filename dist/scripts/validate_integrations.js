"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const integrations_1 = require("../config/integrations");
const readiness = (0, integrations_1.getIntegrationsReadiness)();
console.log('Integrations readiness');
console.log(JSON.stringify(readiness, null, 2));
if (integrations_1.integrationConfig.strictProduction && !readiness.ok) {
    console.error('Strict production integrations check failed.');
    process.exit(1);
}
console.log('Integrations validation passed (non-strict or all configured).');
process.exit(0);

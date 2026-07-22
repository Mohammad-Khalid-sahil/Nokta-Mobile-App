"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.integrationConfig = void 0;
exports.isEmailConfigured = isEmailConfigured;
exports.isSmsConfigured = isSmsConfigured;
exports.isStripeLiveReady = isStripeLiveReady;
exports.isAiConfigured = isAiConfigured;
exports.getIntegrationsReadiness = getIntegrationsReadiness;
const env_1 = require("./env");
function parseBoolean(value, defaultValue) {
    if (value === undefined)
        return defaultValue;
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}
const environment = env_1.config.environment;
const isProduction = environment === 'production';
exports.integrationConfig = {
    publicAppUrl: (process.env.PUBLIC_APP_URL ?? process.env.FRONTEND_URL ?? 'http://localhost:5173').replace(/\/$/, ''),
    apiPublicUrl: (process.env.API_PUBLIC_URL ?? env_1.config.baseUrl).replace(/\/$/, ''),
    strictProduction: parseBoolean(process.env.INTEGRATIONS_STRICT, isProduction),
    email: {
        enabled: parseBoolean(process.env.EMAIL_ENABLED, true),
        mode: (process.env.EMAIL_MODE ?? (isProduction ? 'smtp' : 'console')),
        from: process.env.EMAIL_FROM ?? 'Nokta Academy <noreply@nokta.academy>',
        replyTo: process.env.EMAIL_REPLY_TO ?? '',
        smtp: {
            host: process.env.SMTP_HOST ?? '',
            port: Number(process.env.SMTP_PORT ?? 587),
            secure: parseBoolean(process.env.SMTP_SECURE, false),
            user: process.env.SMTP_USER ?? '',
            pass: process.env.SMTP_PASS ?? ''
        }
    },
    sms: {
        enabled: parseBoolean(process.env.SMS_ENABLED, true),
        mode: (process.env.SMS_MODE ?? (isProduction ? 'http' : 'console')),
        defaultCountryCode: process.env.SMS_DEFAULT_COUNTRY_CODE ?? '93',
        twilio: {
            accountSid: process.env.TWILIO_ACCOUNT_SID ?? '',
            authToken: process.env.TWILIO_AUTH_TOKEN ?? '',
            from: process.env.TWILIO_FROM ?? ''
        },
        http: {
            url: process.env.SMS_HTTP_URL ?? '',
            apiKey: process.env.SMS_HTTP_API_KEY ?? '',
            method: (process.env.SMS_HTTP_METHOD ?? 'POST').toUpperCase()
        }
    },
    stripe: {
        enabled: env_1.config.paymentProvider === 'stripe',
        secretKey: env_1.config.stripeSecretKey,
        webhookSecret: env_1.config.stripeWebhookSecret,
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? ''
    },
    ai: {
        enabled: env_1.config.aiProviderEnabled,
        apiKey: env_1.config.aiProviderApiKey,
        baseUrl: (process.env.AI_PROVIDER_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, ''),
        model: process.env.AI_PROVIDER_MODEL ?? 'gpt-4o-mini',
        timeoutMs: Number(process.env.AI_PROVIDER_TIMEOUT_MS ?? 20000),
        allowSensitiveExternal: env_1.config.aiAllowSensitiveExternal
    },
    tls: {
        trustProxy: parseBoolean(process.env.TRUST_PROXY, true),
        forceHttps: parseBoolean(process.env.FORCE_HTTPS, isProduction),
        hstsMaxAge: Number(process.env.HSTS_MAX_AGE ?? 31536000)
    }
};
function isEmailConfigured() {
    if (!exports.integrationConfig.email.enabled || exports.integrationConfig.email.mode === 'disabled')
        return false;
    if (exports.integrationConfig.email.mode === 'console')
        return true;
    return Boolean(exports.integrationConfig.email.smtp.host);
}
function isSmsConfigured() {
    if (!exports.integrationConfig.sms.enabled || exports.integrationConfig.sms.mode === 'disabled')
        return false;
    if (exports.integrationConfig.sms.mode === 'console')
        return true;
    if (exports.integrationConfig.sms.mode === 'twilio') {
        return Boolean(exports.integrationConfig.sms.twilio.accountSid &&
            exports.integrationConfig.sms.twilio.authToken &&
            exports.integrationConfig.sms.twilio.from);
    }
    return Boolean(exports.integrationConfig.sms.http.url);
}
function isStripeLiveReady() {
    return exports.integrationConfig.stripe.enabled && Boolean(exports.integrationConfig.stripe.secretKey);
}
function isAiConfigured() {
    return exports.integrationConfig.ai.enabled && Boolean(exports.integrationConfig.ai.apiKey);
}
function getIntegrationsReadiness() {
    const email = isEmailConfigured();
    const sms = isSmsConfigured();
    const stripe = !exports.integrationConfig.stripe.enabled || isStripeLiveReady() || env_1.config.paymentMode === 'sandbox';
    const ai = !exports.integrationConfig.ai.enabled || isAiConfigured();
    const issues = [];
    if (exports.integrationConfig.strictProduction) {
        if (exports.integrationConfig.email.mode === 'console')
            issues.push('EMAIL_MODE must not be console in strict production');
        if (exports.integrationConfig.sms.mode === 'console')
            issues.push('SMS_MODE must not be console in strict production');
        if (!email)
            issues.push('SMTP email is not configured');
        if (!sms)
            issues.push('SMS provider is not configured');
        if (exports.integrationConfig.stripe.enabled && !isStripeLiveReady())
            issues.push('Stripe keys missing for live payments');
    }
    return {
        ok: issues.length === 0,
        issues,
        email: { configured: email, mode: exports.integrationConfig.email.mode },
        sms: { configured: sms, mode: exports.integrationConfig.sms.mode },
        stripe: { enabled: exports.integrationConfig.stripe.enabled, liveReady: isStripeLiveReady(), mode: env_1.config.paymentMode },
        ai: { enabled: exports.integrationConfig.ai.enabled, configured: isAiConfigured() }
    };
}

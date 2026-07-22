import { config } from './env';

export type EmailMode = 'console' | 'smtp' | 'disabled';
export type SmsMode = 'console' | 'twilio' | 'http' | 'disabled';
export type AiProviderType = 'openai_compatible' | 'disabled';

function parseBoolean(value: string | undefined, defaultValue: boolean) {
  if (value === undefined) return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

const environment = config.environment;
const isProduction = environment === 'production';

export const integrationConfig = {
  publicAppUrl: (process.env.PUBLIC_APP_URL ?? process.env.FRONTEND_URL ?? 'http://localhost:5173').replace(/\/$/, ''),
  apiPublicUrl: (process.env.API_PUBLIC_URL ?? config.baseUrl).replace(/\/$/, ''),
  strictProduction: parseBoolean(process.env.INTEGRATIONS_STRICT, isProduction),
  email: {
    enabled: parseBoolean(process.env.EMAIL_ENABLED, true),
    mode: (process.env.EMAIL_MODE ?? (isProduction ? 'smtp' : 'console')) as EmailMode,
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
    mode: (process.env.SMS_MODE ?? (isProduction ? 'http' : 'console')) as SmsMode,
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
    enabled: config.paymentProvider === 'stripe',
    secretKey: config.stripeSecretKey,
    webhookSecret: config.stripeWebhookSecret,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? ''
  },
  ai: {
    enabled: config.aiProviderEnabled,
    apiKey: config.aiProviderApiKey,
    baseUrl: (process.env.AI_PROVIDER_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, ''),
    model: process.env.AI_PROVIDER_MODEL ?? 'gpt-4o-mini',
    timeoutMs: Number(process.env.AI_PROVIDER_TIMEOUT_MS ?? 20000),
    allowSensitiveExternal: config.aiAllowSensitiveExternal
  },
  tls: {
    trustProxy: parseBoolean(process.env.TRUST_PROXY, true),
    forceHttps: parseBoolean(process.env.FORCE_HTTPS, isProduction),
    hstsMaxAge: Number(process.env.HSTS_MAX_AGE ?? 31536000)
  }
};

export function isEmailConfigured() {
  if (!integrationConfig.email.enabled || integrationConfig.email.mode === 'disabled') return false;
  if (integrationConfig.email.mode === 'console') return true;
  return Boolean(integrationConfig.email.smtp.host);
}

export function isSmsConfigured() {
  if (!integrationConfig.sms.enabled || integrationConfig.sms.mode === 'disabled') return false;
  if (integrationConfig.sms.mode === 'console') return true;
  if (integrationConfig.sms.mode === 'twilio') {
    return Boolean(
      integrationConfig.sms.twilio.accountSid &&
      integrationConfig.sms.twilio.authToken &&
      integrationConfig.sms.twilio.from
    );
  }
  return Boolean(integrationConfig.sms.http.url);
}

export function isStripeLiveReady() {
  return integrationConfig.stripe.enabled && Boolean(integrationConfig.stripe.secretKey);
}

export function isAiConfigured() {
  return integrationConfig.ai.enabled && Boolean(integrationConfig.ai.apiKey);
}

export function getIntegrationsReadiness() {
  const email = isEmailConfigured();
  const sms = isSmsConfigured();
  const stripe = !integrationConfig.stripe.enabled || isStripeLiveReady() || config.paymentMode === 'sandbox';
  const ai = !integrationConfig.ai.enabled || isAiConfigured();

  const issues: string[] = [];
  if (integrationConfig.strictProduction) {
    if (integrationConfig.email.mode === 'console') issues.push('EMAIL_MODE must not be console in strict production');
    if (integrationConfig.sms.mode === 'console') issues.push('SMS_MODE must not be console in strict production');
    if (!email) issues.push('SMTP email is not configured');
    if (!sms) issues.push('SMS provider is not configured');
    if (integrationConfig.stripe.enabled && !isStripeLiveReady()) issues.push('Stripe keys missing for live payments');
  }

  return {
    ok: issues.length === 0,
    issues,
    email: { configured: email, mode: integrationConfig.email.mode },
    sms: { configured: sms, mode: integrationConfig.sms.mode },
    stripe: { enabled: integrationConfig.stripe.enabled, liveReady: isStripeLiveReady(), mode: config.paymentMode },
    ai: { enabled: integrationConfig.ai.enabled, configured: isAiConfigured() }
  };
}

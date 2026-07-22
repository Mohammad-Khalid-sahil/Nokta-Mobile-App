import { integrationConfig, isSmsConfigured } from '../config/integrations';
import { logger } from '../utils/logger';

export type SmsPayload = {
  phone: string;
  message: string;
  purpose?: string;
};

function normalizePhone(phone: string) {
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) return `+${digits.slice(2)}`;
  if (digits.startsWith('0')) return `+${integrationConfig.sms.defaultCountryCode}${digits.slice(1)}`;
  if (digits.length === 9 || digits.length === 10) return `+${integrationConfig.sms.defaultCountryCode}${digits.replace(/^0/, '')}`;
  return digits.startsWith('+') ? `+${digits.slice(1)}` : `+${digits}`;
}

export class SmsService {
  async send(payload: SmsPayload) {
    if (!integrationConfig.sms.enabled || integrationConfig.sms.mode === 'disabled') {
      return { delivered: false, channel: 'sms', reason: 'sms_disabled' };
    }

    const phone = normalizePhone(payload.phone);
    if (!phone) {
      return { delivered: false, channel: 'sms', reason: 'invalid_phone' };
    }

    if (integrationConfig.sms.mode === 'console') {
      logger.info('SMS (console mode)', { phone, purpose: payload.purpose ?? 'general', message: payload.message });
      return { delivered: true, channel: 'sms', mode: 'console' };
    }

    if (!isSmsConfigured()) {
      return { delivered: false, channel: 'sms', reason: 'sms_provider_not_configured' };
    }

    if (integrationConfig.sms.mode === 'twilio') {
      return this.sendTwilio(phone, payload.message);
    }

    return this.sendHttp(phone, payload.message);
  }

  async sendOtp(phone: string, code: string, purpose = 'verification') {
    return this.send({
      phone,
      purpose,
      message: `کود تأیید نکته: ${code}. این کود را با کسی شریک نسازید.`
    });
  }

  private async sendTwilio(phone: string, message: string) {
    const { accountSid, authToken, from } = integrationConfig.sms.twilio;
    const body = new URLSearchParams({
      To: phone,
      From: from,
      Body: message
    });
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body
    });

    if (!response.ok) {
      const detail = await response.text();
      logger.warn('Twilio SMS failed', { status: response.status, detail: detail.slice(0, 200) });
      return { delivered: false, channel: 'sms', reason: 'twilio_error' };
    }

    return { delivered: true, channel: 'sms', mode: 'twilio' };
  }

  private async sendHttp(phone: string, message: string) {
    const { url, apiKey, method } = integrationConfig.sms.http;
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
      },
      body: JSON.stringify({ phone, message })
    });

    if (!response.ok) {
      const detail = await response.text();
      logger.warn('HTTP SMS provider failed', { status: response.status, detail: detail.slice(0, 200) });
      return { delivered: false, channel: 'sms', reason: 'http_sms_error' };
    }

    return { delivered: true, channel: 'sms', mode: 'http' };
  }
}

export const smsService = new SmsService();

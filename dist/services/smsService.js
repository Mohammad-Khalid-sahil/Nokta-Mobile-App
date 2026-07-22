"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.smsService = exports.SmsService = void 0;
const integrations_1 = require("../config/integrations");
const logger_1 = require("../utils/logger");
function normalizePhone(phone) {
    const digits = String(phone).replace(/\D/g, '');
    if (!digits)
        return '';
    if (digits.startsWith('00'))
        return `+${digits.slice(2)}`;
    if (digits.startsWith('0'))
        return `+${integrations_1.integrationConfig.sms.defaultCountryCode}${digits.slice(1)}`;
    if (digits.length === 9 || digits.length === 10)
        return `+${integrations_1.integrationConfig.sms.defaultCountryCode}${digits.replace(/^0/, '')}`;
    return digits.startsWith('+') ? `+${digits.slice(1)}` : `+${digits}`;
}
class SmsService {
    async send(payload) {
        if (!integrations_1.integrationConfig.sms.enabled || integrations_1.integrationConfig.sms.mode === 'disabled') {
            return { delivered: false, channel: 'sms', reason: 'sms_disabled' };
        }
        const phone = normalizePhone(payload.phone);
        if (!phone) {
            return { delivered: false, channel: 'sms', reason: 'invalid_phone' };
        }
        if (integrations_1.integrationConfig.sms.mode === 'console') {
            logger_1.logger.info('SMS (console mode)', { phone, purpose: payload.purpose ?? 'general', message: payload.message });
            return { delivered: true, channel: 'sms', mode: 'console' };
        }
        if (!(0, integrations_1.isSmsConfigured)()) {
            return { delivered: false, channel: 'sms', reason: 'sms_provider_not_configured' };
        }
        if (integrations_1.integrationConfig.sms.mode === 'twilio') {
            return this.sendTwilio(phone, payload.message);
        }
        return this.sendHttp(phone, payload.message);
    }
    async sendOtp(phone, code, purpose = 'verification') {
        return this.send({
            phone,
            purpose,
            message: `کود تأیید نکته: ${code}. این کود را با کسی شریک نسازید.`
        });
    }
    async sendTwilio(phone, message) {
        const { accountSid, authToken, from } = integrations_1.integrationConfig.sms.twilio;
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
            logger_1.logger.warn('Twilio SMS failed', { status: response.status, detail: detail.slice(0, 200) });
            return { delivered: false, channel: 'sms', reason: 'twilio_error' };
        }
        return { delivered: true, channel: 'sms', mode: 'twilio' };
    }
    async sendHttp(phone, message) {
        const { url, apiKey, method } = integrations_1.integrationConfig.sms.http;
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
            logger_1.logger.warn('HTTP SMS provider failed', { status: response.status, detail: detail.slice(0, 200) });
            return { delivered: false, channel: 'sms', reason: 'http_sms_error' };
        }
        return { delivered: true, channel: 'sms', mode: 'http' };
    }
}
exports.SmsService = SmsService;
exports.smsService = new SmsService();

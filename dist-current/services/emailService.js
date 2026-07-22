"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.emailService = exports.EmailService = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const integrations_1 = require("../config/integrations");
const logger_1 = require("../utils/logger");
let transporter = null;
function getTransporter() {
    if (transporter)
        return transporter;
    const { smtp } = integrations_1.integrationConfig.email;
    transporter = nodemailer_1.default.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined
    });
    return transporter;
}
class EmailService {
    async send(payload) {
        if (!integrations_1.integrationConfig.email.enabled || integrations_1.integrationConfig.email.mode === 'disabled') {
            return { delivered: false, channel: 'email', reason: 'email_disabled' };
        }
        if (!payload.to) {
            return { delivered: false, channel: 'email', reason: 'missing_recipient' };
        }
        if (integrations_1.integrationConfig.email.mode === 'console') {
            logger_1.logger.info('Email (console mode)', {
                to: payload.to,
                subject: payload.subject,
                preview: payload.text.slice(0, 240)
            });
            return { delivered: true, channel: 'email', mode: 'console' };
        }
        if (!(0, integrations_1.isEmailConfigured)()) {
            return { delivered: false, channel: 'email', reason: 'smtp_not_configured' };
        }
        await getTransporter().sendMail({
            from: integrations_1.integrationConfig.email.from,
            replyTo: integrations_1.integrationConfig.email.replyTo || undefined,
            to: payload.to,
            subject: payload.subject,
            text: payload.text,
            html: payload.html ?? payload.text
        });
        return { delivered: true, channel: 'email', mode: 'smtp' };
    }
    buildVerificationUrl(token) {
        return `${integrations_1.integrationConfig.publicAppUrl}/verify-email?token=${encodeURIComponent(token)}`;
    }
    buildPasswordResetUrl(token) {
        return `${integrations_1.integrationConfig.publicAppUrl}/reset-password?token=${encodeURIComponent(token)}`;
    }
    async sendEmailVerification(to, token) {
        const url = this.buildVerificationUrl(token);
        return this.send({
            to,
            subject: 'تأیید ایمیل — اکادمی نکته',
            text: `برای تأیید ایمیل خود از این لینک استفاده کنید: ${url}`,
            html: `<p>برای تأیید ایمیل خود <a href="${url}">اینجا کلیک کنید</a>.</p><p>یا کد: <strong>${token}</strong></p>`
        });
    }
    async sendPasswordReset(to, token) {
        const url = this.buildPasswordResetUrl(token);
        return this.send({
            to,
            subject: 'بازیابی رمز عبور — اکادمی نکته',
            text: `برای تنظیم رمز جدید: ${url}`,
            html: `<p>برای بازیابی رمز <a href="${url}">اینجا کلیک کنید</a>.</p>`
        });
    }
    async sendParentWelcomeCredentials(input) {
        const loginUrl = `${integrations_1.integrationConfig.publicAppUrl}/login`;
        return this.send({
            to: input.to,
            subject: 'Parent account created - Nokta Academy',
            text: [
                `Dear ${input.parentName || 'Parent'},`,
                '',
                `A parent account has been created for ${input.studentName}.`,
                `Login URL: ${loginUrl}`,
                `Email: ${input.email}`,
                `Password: ${input.password}`,
                '',
                'Please sign in and change your password after the first login.'
            ].join('\n'),
            html: [
                `<p>Dear ${input.parentName || 'Parent'},</p>`,
                `<p>A parent account has been created for <strong>${input.studentName}</strong>.</p>`,
                `<p><strong>Login URL:</strong> <a href="${loginUrl}">${loginUrl}</a></p>`,
                `<p><strong>Email:</strong> ${input.email}<br><strong>Password:</strong> ${input.password}</p>`,
                '<p>Please sign in and change your password after the first login.</p>'
            ].join('')
        });
    }
}
exports.EmailService = EmailService;
exports.emailService = new EmailService();

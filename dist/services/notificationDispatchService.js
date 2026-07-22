"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationDispatchService = void 0;
const Notification_1 = require("../models/Notification");
const User_1 = require("../models/User");
const emailService_1 = require("./emailService");
const smsService_1 = require("./smsService");
const localizedText_1 = require("../utils/localizedText");
class NotificationDispatchService {
    async send(payload) {
        const channel = payload.channel ?? 'in_app';
        const lang = payload.lang ?? 'en';
        const titleText = (0, localizedText_1.resolveLocalizedText)(payload.title, lang);
        const messageText = (0, localizedText_1.resolveLocalizedText)(payload.message, lang);
        const titleStored = (0, localizedText_1.normalizeLocalizedInput)(payload.title);
        const messageStored = (0, localizedText_1.normalizeLocalizedInput)(payload.message);
        if (channel === 'email') {
            const email = payload.recipientEmail ?? await this.resolveRecipientEmail(payload.recipientIds?.[0]);
            const result = await emailService_1.emailService.send({
                to: email ?? '',
                subject: titleText,
                text: messageText,
                html: `<p>${messageText}</p>`
            });
            return { delivered: result.delivered, channel, reason: result.delivered ? undefined : result.reason };
        }
        if (channel === 'sms') {
            const phone = payload.recipientPhone ?? await this.resolveRecipientPhone(payload.recipientIds?.[0]);
            const result = await smsService_1.smsService.send({ phone: phone ?? '', message: messageText, purpose: 'notification' });
            return { delivered: result.delivered, channel, reason: result.delivered ? undefined : result.reason };
        }
        await Notification_1.Notification.create({
            title: titleStored,
            description: messageStored,
            message: messageStored,
            publishStatus: 'published',
            branchId: payload.branchId ?? null,
            recipientIds: payload.recipientIds ?? [],
            recipientRoles: payload.recipientRoles ?? [],
            isPublic: false,
            visibility: 'private'
        });
        return { delivered: true, channel: 'in_app' };
    }
    async resolveRecipientEmail(userId) {
        if (!userId)
            return null;
        const user = await User_1.User.findById(userId).select('email').lean();
        return user?.email ?? null;
    }
    async resolveRecipientPhone(userId) {
        if (!userId)
            return null;
        const user = await User_1.User.findById(userId).select('phone').lean();
        return user?.phone ?? null;
    }
}
exports.NotificationDispatchService = NotificationDispatchService;

import { Notification } from '../models/Notification';
import { User } from '../models/User';
import { emailService } from './emailService';
import { smsService } from './smsService';
import { normalizeLocalizedInput, resolveLocalizedText } from '../utils/localizedText';

type DispatchChannel = 'in_app' | 'email' | 'sms';

type DispatchPayload = {
  title: string | { en?: string; fa?: string; ps?: string };
  message: string | { en?: string; fa?: string; ps?: string };
  recipientIds?: string[];
  recipientRoles?: string[];
  branchId?: string | null;
  channel?: DispatchChannel;
  recipientEmail?: string;
  recipientPhone?: string;
  lang?: string;
};

export class NotificationDispatchService {
  async send(payload: DispatchPayload) {
    const channel = payload.channel ?? 'in_app';
    const lang = payload.lang ?? 'en';
    const titleText = resolveLocalizedText(payload.title, lang);
    const messageText = resolveLocalizedText(payload.message, lang);
    const titleStored = normalizeLocalizedInput(payload.title);
    const messageStored = normalizeLocalizedInput(payload.message);

    if (channel === 'email') {
      const email = payload.recipientEmail ?? await this.resolveRecipientEmail(payload.recipientIds?.[0]);
      const result = await emailService.send({
        to: email ?? '',
        subject: titleText,
        text: messageText,
        html: `<p>${messageText}</p>`
      });
      return { delivered: result.delivered, channel, reason: result.delivered ? undefined : (result as { reason?: string }).reason };
    }
    if (channel === 'sms') {
      const phone = payload.recipientPhone ?? await this.resolveRecipientPhone(payload.recipientIds?.[0]);
      const result = await smsService.send({ phone: phone ?? '', message: messageText, purpose: 'notification' });
      return { delivered: result.delivered, channel, reason: result.delivered ? undefined : (result as { reason?: string }).reason };
    }

    await Notification.create({
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

  private async resolveRecipientEmail(userId?: string) {
    if (!userId) return null;
    const user = await User.findById(userId).select('email').lean<{ email?: string }>();
    return user?.email ?? null;
  }

  private async resolveRecipientPhone(userId?: string) {
    if (!userId) return null;
    const user = await User.findById(userId).select('phone').lean<{ phone?: string }>();
    return user?.phone ?? null;
  }
}

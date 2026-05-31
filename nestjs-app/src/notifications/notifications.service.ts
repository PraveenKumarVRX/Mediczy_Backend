import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { addJob, QUEUE_NAMES, dispatchEmergencyAlert } from '../../../server/config/queues.js';
import { Pagination } from '../common/decorators/org-id.decorator';

export type NotificationChannel = 'push' | 'sms' | 'email' | 'in_app' | 'whatsapp';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyNotifications(userId: number, page: number, limit: number) {
    const skip = (page - 1) * limit;

    const [data, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where:   { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where: { userId } }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    return { data, total, unreadCount, page, limit, pages: Math.ceil(total / limit) };
  }

  async markRead(userId: number, notificationId?: number) {
    if (notificationId) {
      await this.prisma.notification.updateMany({
        where: { id: notificationId, userId },
        data:  { isRead: true, readAt: new Date() },
      });
    } else {
      // Mark all as read
      await this.prisma.notification.updateMany({
        where: { userId, isRead: false },
        data:  { isRead: true, readAt: new Date() },
      });
    }
    return { success: true };
  }

  async send(data: {
    userId:         number;
    orgId?:         number;
    type:           string;
    title:          string;
    message:        string;
    channels:       NotificationChannel[];
    metadata?:      Record<string, any>;
    priority?:      'low' | 'normal' | 'high' | 'critical';
  }) {
    // Store in-app notification
    const notification = await this.prisma.notification.create({
      data: {
        userId:         data.userId,
        organizationId: data.orgId,
        type:           data.type,
        title:          data.title,
        message:        data.message,
        channel:        data.channels[0] || 'in_app',
        metadata:       data.metadata || {},
      },
    });

    // Queue external delivery channels
    if (data.priority === 'critical') {
      await dispatchEmergencyAlert({
        userId:    data.userId,
        alertType: data.type,
        severity:  'CRITICAL',
        orgId:     data.orgId,
        metadata:  { title: data.title, message: data.message, ...data.metadata },
      });
    } else {
      await addJob(QUEUE_NAMES.NOTIFICATIONS, 'send-notification', {
        notificationId: notification.id,
        userId:         data.userId,
        type:           data.type,
        title:          data.title,
        message:        data.message,
        channels:       data.channels,
        metadata:       data.metadata,
      });
    }

    return notification;
  }

  async getPreferences(userId: number) {
    const user = await this.prisma.user.findUnique({
      where:  { id: userId },
      select: { preferences: true },
    });
    return (user?.preferences as any)?.notifications || {
      email: true, sms: true, push: true, whatsapp: false, in_app: true,
    };
  }

  async updatePreferences(userId: number, prefs: Record<string, boolean>) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { preferences: true } });
    const current = (user?.preferences as any) || {};

    await this.prisma.user.update({
      where: { id: userId },
      data:  { preferences: { ...current, notifications: prefs } },
    });

    return { updated: true };
  }
}

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class NotificationPreferenceService {
  async updatePreferences(userId: string, preferences: { email?: boolean; sms?: boolean; push?: boolean }) {
    return prisma.notificationPreference.upsert({
      where: { userId },
      update: preferences,
      create: {
        userId,
        ...preferences
      }
    });
  }

  async getPreferences(userId: string) {
    return prisma.notificationPreference.findUnique({
      where: { userId }
    });
  }
}
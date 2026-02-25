import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class WalletService {
  async getBalance(userId: string): Promise<number> {
    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) return 0;
    return Number(wallet.balance);
  }

  async ensureWallet(userId: string) {
    return prisma.wallet.upsert({
      where: { userId },
      update: {},
      create: { userId, balance: 0 }
    });
  }

  async debit(userId: string, amount: number): Promise<boolean> {
    await this.ensureWallet(userId);

    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) return false;

    const current = Number(wallet.balance);
    if (current < amount) return false;

    const newBalance = current - amount;
    await prisma.wallet.update({ where: { userId }, data: { balance: newBalance } });
    return true;
  }

  async credit(userId: string, amount: number): Promise<void> {
    await this.ensureWallet(userId);
    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    const current = Number(wallet?.balance || 0);
    await prisma.wallet.update({ where: { userId }, data: { balance: current + amount } });
  }
}

export const walletService = new WalletService();

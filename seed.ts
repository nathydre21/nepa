import { PrismaClient, BillStatus, PaymentStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding ...');

  // Create Users
  const user1 = await prisma.user.upsert({
    where: { email: 'john.doe@example.com' },
    update: {},
    create: {
      email: 'john.doe@example.com',
      name: 'John Doe',
    },
  });

  const user2 = await prisma.user.upsert({
    where: { email: 'jane.smith@example.com' },
    update: {},
    create: {
      email: 'jane.smith@example.com',
      name: 'Jane Smith',
    },
  });

  // Create Utilities
  const electricUtility = await prisma.utility.create({
    data: {
      name: 'City Power',
      type: 'ELECTRICITY',
      provider: 'National Grid',
    },
  });

  const waterUtility = await prisma.utility.create({
    data: {
      name: 'Clean Water Co',
      type: 'WATER',
      provider: 'City Water Dept',
    },
  });

  // Create Bills
  const bill1 = await prisma.bill.create({
    data: {
      amount: 150.00,
      dueDate: new Date(new Date().setDate(new Date().getDate() + 10)), // Due in 10 days
      status: BillStatus.PENDING,
      userId: user1.id,
      utilityId: electricUtility.id,
    },
  });

  const bill2 = await prisma.bill.create({
    data: {
      amount: 45.50,
      dueDate: new Date(new Date().setDate(new Date().getDate() - 5)), // Overdue
      status: BillStatus.OVERDUE,
      userId: user2.id,
      utilityId: waterUtility.id,
    },
  });

  // Create Payments
  await prisma.payment.create({
    data: {
      amount: 45.50,
      method: 'CREDIT_CARD',
      status: PaymentStatus.SUCCESS,
      transactionId: 'txn_123456789',
      billId: bill2.id,
      userId: user2.id,
    },
  });

  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
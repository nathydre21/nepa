-- Migration: Add Scheduled Payment Tables
-- Work #120: Automated Bill Payment Scheduling

CREATE TYPE "ScheduleFrequency" AS ENUM (
  'DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY'
);

CREATE TYPE "ScheduledPaymentStatus" AS ENUM (
  'ACTIVE', 'PAUSED', 'CANCELLED', 'COMPLETED'
);

CREATE TYPE "PaymentExecutionStatus" AS ENUM (
  'SUCCESS', 'FAILED', 'RETRYING', 'SKIPPED'
);

CREATE TABLE "ScheduledPayment" (
  "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"        TEXT NOT NULL,
  "billId"        TEXT NOT NULL,
  "amount"        DECIMAL(10,2) NOT NULL,
  "paymentMethod" TEXT NOT NULL,
  "frequency"     "ScheduleFrequency" NOT NULL,
  "status"        "ScheduledPaymentStatus" NOT NULL DEFAULT 'ACTIVE',
  "nextRunAt"     TIMESTAMPTZ NOT NULL,
  "lastRunAt"     TIMESTAMPTZ,
  "endDate"       TIMESTAMPTZ,
  "maxRetries"    INT NOT NULL DEFAULT 3,
  "retryCount"    INT NOT NULL DEFAULT 0,
  "retryAfter"    TIMESTAMPTZ,
  "metadata"      JSONB DEFAULT '{}',
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "PaymentExecutionLog" (
  "id"                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "scheduledPaymentId" UUID NOT NULL REFERENCES "ScheduledPayment"("id") ON DELETE CASCADE,
  "userId"             TEXT NOT NULL,
  "amount"             DECIMAL(10,2) NOT NULL,
  "status"             "PaymentExecutionStatus" NOT NULL,
  "transactionId"      TEXT,
  "errorMessage"       TEXT,
  "attemptNumber"      INT NOT NULL DEFAULT 1,
  "walletBalanceBefore" DECIMAL(10,2),
  "executedAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scheduled_payment_user     ON "ScheduledPayment"("userId");
CREATE INDEX idx_scheduled_payment_status   ON "ScheduledPayment"("status");
CREATE INDEX idx_scheduled_payment_next_run ON "ScheduledPayment"("nextRunAt");
CREATE INDEX idx_scheduled_payment_active   ON "ScheduledPayment"("status","nextRunAt") WHERE "status" = 'ACTIVE';
CREATE INDEX idx_execution_log_scheduled_id ON "PaymentExecutionLog"("scheduledPaymentId");
CREATE INDEX idx_execution_log_user         ON "PaymentExecutionLog"("userId");
CREATE INDEX idx_execution_log_status       ON "PaymentExecutionLog"("status");
CREATE INDEX idx_execution_log_executed_at  ON "PaymentExecutionLog"("executedAt");

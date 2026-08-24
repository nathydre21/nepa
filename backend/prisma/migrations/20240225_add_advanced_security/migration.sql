-- Migration: Add Advanced Security Tables
-- Created: 2024-02-25
-- Description: Adds API Key management and MFA backup code tables

-- Create ApiKey table
CREATE TABLE "ApiKey" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "name" VARCHAR(255) NOT NULL,
    "keyHash" VARCHAR(255) NOT NULL,
    "keyPrefix" VARCHAR(50) NOT NULL,
    "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "scopes" TEXT[] NOT NULL DEFAULT '{}',
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for ApiKey table
CREATE INDEX "ApiKey_userId_idx" ON "ApiKey"("userId");
CREATE INDEX "ApiKey_keyHash_idx" ON "ApiKey"("keyHash");
CREATE INDEX "ApiKey_keyPrefix_idx" ON "ApiKey"("keyPrefix");
CREATE INDEX "ApiKey_expiresAt_idx" ON "ApiKey"("expiresAt");
CREATE INDEX "ApiKey_isActive_idx" ON "ApiKey"("isActive");

-- Create MfaBackupCode table
CREATE TABLE "MfaBackupCode" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "codeHash" VARCHAR(255) NOT NULL,
    "isUsed" BOOLEAN NOT NULL DEFAULT false,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for MfaBackupCode table
CREATE INDEX "MfaBackupCode_userId_idx" ON "MfaBackupCode"("userId");
CREATE INDEX "MfaBackupCode_codeHash_idx" ON "MfaBackupCode"("codeHash");

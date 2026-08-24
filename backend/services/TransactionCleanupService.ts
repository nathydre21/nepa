import { getCacheManager } from './RedisCacheManager';
import { logger } from './logger';

const cacheManager = getCacheManager();
const PENDING_MAX_AGE_SECONDS = parseInt(process.env.TRANSACTION_PENDING_MAX_AGE_SECONDS || String(60 * 60 * 24)); // 1 day
const COMPLETED_RETENTION_SECONDS = parseInt(process.env.TRANSACTION_RETENTION_SECONDS || String(60 * 60 * 24 * 30)); // 30 days

export function startTransactionCleanup(intervalMs: number = 1000 * 60 * 60) {
  // Run cleanup periodically (default hourly)
  setInterval(async () => {
    try {
      const keys = await cacheManager.scanKeys('transaction:*');
      if (!keys || keys.length === 0) return;

      const now = Date.now();
      for (const logicalKey of keys) {
        try {
          const tx = await cacheManager.get<any>(logicalKey);
          if (!tx || !tx.createdAt) continue;

          const created = new Date(tx.createdAt).getTime();
          const ageSec = Math.floor((now - created) / 1000);

          // If pending for too long, mark as failed
          if (tx.status === 'pending' || tx.status === 'processing') {
            if (ageSec > PENDING_MAX_AGE_SECONDS) {
              tx.status = 'failed';
              tx.errorMessage = 'Marked failed by cleanup job due to timeout';
              tx.updatedAt = new Date();
              await cacheManager.set(logicalKey, tx, { ttl: COMPLETED_RETENTION_SECONDS, tags: ['transaction'] });
              logger.info(`Marked stale transaction ${tx.id} as failed by cleanup job`);
            }
          } else {
            // Completed/failed — if older than retention, delete
            if (ageSec > COMPLETED_RETENTION_SECONDS) {
              await cacheManager.delete(logicalKey);
              logger.info(`Removed old transaction ${tx.id} from cache by cleanup job`);
            }
          }
        } catch (e) {
          logger.error('Error processing transaction key in cleanup job:', e as any);
        }
      }
    } catch (error) {
      logger.error('Transaction cleanup job error:', error as any);
    }
  }, intervalMs);
}

export default { startTransactionCleanup };

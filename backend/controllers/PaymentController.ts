import { Request, Response } from 'express';
import { BillingService } from '../BillingService';
import { paymentLimiter, transactionLimiter } from '../middleware/rateLimiter';
import { conditionalCaptcha } from '../middleware/captcha';
import { abuseDetector } from '../middleware/abuseDetection';
import { invalidateUserCache, invalidateCacheByPattern } from '../middleware/cache';
import { Server, TransactionBuilder, Networks, BASE_FEE, Asset, Transaction } from 'stellar-sdk';
import { getCacheManager } from '../services/RedisCacheManager';

const billingService = new BillingService();

// Stellar configuration
const stellarServer = new Server('https://horizon-testnet.stellar.org');
const stellarNetwork = Networks.TESTNET;
const STELLAR_ASSET = Asset.native(); // Using XLM as the primary asset

// Transaction status tracking
interface TransactionStatus {
  id: string;
  userId: string;
  billId: string;
  amount: number;
  paymentMethod: string;
  stellarTransactionId?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';
  createdAt: Date;
  updatedAt: Date;
  errorMessage?: string;
}

// Use Redis for transaction status storage (shared, persistent across instances)
const cacheManager = getCacheManager();
const TRANSACTION_TTL = parseInt(process.env.TRANSACTION_TTL_SECONDS || '604800'); // default 7 days

// Apply rate limiting and security to all payment routes
export const applyPaymentSecurity = [
  abuseDetector,
  paymentLimiter,
  transactionLimiter,
  conditionalCaptcha
];

/**
 * @openapi
 * /api/payment/prepare:
 *   post:
 *     summary: Prepare an unsigned Stellar payment transaction for client-side signing
 *     description: >
 *       Returns a base64-encoded unsigned transaction XDR that the client must sign
 *       with their wallet (Freighter, xBull, Albedo, etc.) before submitting via
 *       /api/payment/process. The server never receives or handles the user's secret key.
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               billId:
 *                 type: string
 *               amount:
 *                 type: number
 *               sourcePublicKey:
 *                 type: string
 *                 description: The user's Stellar public key (G...). Never the secret key.
 *     responses:
 *       200:
 *         description: Unsigned transaction XDR prepared successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 unsignedXdr:
 *                   type: string
 *                   description: Base64-encoded unsigned transaction XDR for client-side signing
 *                 networkPassphrase:
 *                   type: string
 *       400:
 *         description: Invalid request data
 */
export const prepareStellarPayment = async (req: Request, res: Response) => {
  // SECURITY (Issue #406): This endpoint never handles secret keys. It builds an
  // unsigned transaction that the client signs locally with their wallet, then
  // the client returns the signed XDR via /api/payment/process for submission
  // to the Stellar network. The user's secret key NEVER touches the server.
  const { billId, amount, sourcePublicKey } = req.body;
  const userId = (req as any).user?.id;

  // Validate that the user is authenticated
  if (!userId) {
    return res.status(401).json({
      status: 401,
      error: 'User authentication required'
    });
  }

  // Validate required fields — sourcePublicKey is the user's PUBLIC key only
  if (!billId || !amount || !sourcePublicKey) {
    return res.status(400).json({
      status: 400,
      error: 'Missing required fields: billId, amount, sourcePublicKey'
    });
  }

  // Validate amount is positive
  if (amount <= 0) {
    return res.status(400).json({
      status: 400,
      error: 'Payment amount must be greater than 0'
    });
  }

  try {
    // Load the source account from the Stellar network using the PUBLIC key only.
    // The server never has access to the user's secret key at any point in this flow.
    const sourceAccount = await stellarServer.loadAccount(sourcePublicKey);

    // Build an unsigned transaction — the client will sign this with their wallet
    const transaction = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: stellarNetwork
    })
      .addOperation({
        type: 'payment',
        destination: process.env.STELLAR_MERCHANT_WALLET || 'GATESTNETACCOUNT',
        asset: STELLAR_ASSET,
        amount: (amount * 10000000).toString(), // Convert to stroops (7 decimal places)
      })
      .setTimeout(180) // Give the client 3 minutes to sign with their wallet
      .build();

    // Return the unsigned XDR for the client to sign — no secret keys involved
    res.status(200).json({
      status: 200,
      message: 'Unsigned transaction prepared. Sign with your wallet and submit via /api/payment/process',
      data: {
        unsignedXdr: transaction.toXDR().toString('base64'),
        networkPassphrase: stellarNetwork,
        amount,
        billId,
        destination: process.env.STELLAR_MERCHANT_WALLET || 'GATESTNETACCOUNT'
      }
    });
  } catch (error: any) {
    console.error('Error preparing Stellar transaction:', error);
    res.status(400).json({
      status: 400,
      error: 'Failed to prepare Stellar transaction',
      details: error.message
    });
  }
};

/**
 * @openapi
 * /api/payment/process:
 *   post:
 *     summary: Process a payment
 *     description: >
 *       For Stellar payments, the client must first call /api/payment/prepare to
 *       get an unsigned XDR, sign it with their wallet, then submit the signed
 *       XDR here. The server never receives or handles the user's secret key.
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               billId:
 *                 type: string
 *               amount:
 *                 type: number
 *               paymentMethod:
 *                 type: string
 *                 enum: [BANK_TRANSFER, CREDIT_CARD, STELLAR]
 *               signedXdr:
 *                 type: string
 *                 description: >
 *                   Base64-encoded signed transaction XDR (required for STELLAR payments).
 *                   The client signs the unsigned XDR from /api/payment/prepare
 *                   using their wallet (Freighter, xBull, Albedo, etc.).
 *               recaptchaToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Payment processed successfully
 *       429:
 *         description: Rate limit exceeded
 *       400:
 *         description: Invalid payment data
 */
export const processPayment = async (req: Request, res: Response) => {
  const transactionId = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    // SECURITY FIX (Issue #406): stellarSecretKey has been REMOVED from the
    // request body. Instead, the client now sends a `signedXdr` — a transaction
    // they signed locally with their wallet. The server only submits the
    // pre-signed transaction to the Stellar network. The user's secret key
    // NEVER touches the server.
    //
    // Previous (vulnerable) code:
    //   const { billId, amount, paymentMethod, stellarSecretKey } = req.body;
    //
    // Fixed code:
    const { billId, amount, paymentMethod, signedXdr } = req.body;
    const userId = (req as any).user?.id;
    
    if (!userId) {
      return res.status(401).json({
        status: 401,
        error: 'User authentication required'
      });
    }
    
    // Validate payment data
    if (!billId || !amount || !paymentMethod) {
      return res.status(400).json({
        status: 400,
        error: 'Missing required payment fields'
      });
    }
    
    if (amount <= 0) {
      return res.status(400).json({
        status: 400,
        error: 'Payment amount must be greater than 0'
      });
    }

    // SECURITY (Issue #406): Reject any request that attempts to pass a secret
    // key — this field should never be present. Log the attempt for security
    // monitoring to detect potential attacks or misconfigured clients.
    if (req.body.stellarSecretKey || req.body.secretKey || req.body.seed) {
      console.warn(`[SECURITY] User ${userId} attempted to pass a secret key in payment request. This is a security violation.`);
      return res.status(400).json({
        status: 400,
        error: 'Secret keys must never be sent to the server. Please sign your transaction locally with your wallet and submit the signed XDR.'
      });
    }

    // Initialize transaction status (persist to Redis with TTL)
    const transactionStatus: TransactionStatus = {
      id: transactionId,
      userId,
      billId,
      amount,
      paymentMethod,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    await cacheManager.set(`transaction:${transactionId}`, transactionStatus, { ttl: TRANSACTION_TTL, tags: ['transaction', `user:${userId}`] });

    let paymentResult;
    let stellarTransactionId: string | undefined;

    // Handle Stellar blockchain payments
    if (paymentMethod === 'STELLAR') {
      // SECURITY FIX (Issue #406): Instead of requiring the secret key, we now
      // require a signedXdr — a transaction that the client has already signed
      // with their wallet (Freighter, xBull, Albedo, etc.).
      //
      // The new secure flow is:
      //   1. Client calls /api/payment/prepare to get an unsigned XDR
      //   2. Client signs the XDR with their wallet locally (secret key never leaves the client)
      //   3. Client sends the signed XDR here for submission to the network
      //
      // The server NEVER sees or handles the user's secret key.
      if (!signedXdr) {
        return res.status(400).json({
          status: 400,
          error: 'Signed XDR is required for Stellar payments. Call /api/payment/prepare first, sign the transaction with your wallet, then submit the signed XDR.'
        });
      }

      // Update status to processing and persist
      transactionStatus.status = 'processing';
      transactionStatus.updatedAt = new Date();
      await cacheManager.set(`transaction:${transactionId}`, transactionStatus, { ttl: TRANSACTION_TTL, tags: ['transaction', `user:${userId}`] });

      try {
        // Reconstruct the transaction from the client-signed XDR.
        // The transaction is already signed by the client's wallet — the server
        // does NOT need the user's secret key to submit it to the network.
        const signedTransaction = new Transaction(signedXdr, stellarNetwork);

        // SECURITY: Verify the transaction has at least one signature before
        // submitting. This ensures the client actually signed it with their
        // wallet and didn't send an unsigned XDR.
        if (!signedTransaction.signatures || signedTransaction.signatures.length === 0) {
          throw new Error('Transaction has no signatures — the client must sign the XDR with their wallet before submitting');
        }

        // Submit the pre-signed transaction to the Stellar network.
        // The server does not sign anything — it only relays the client's
        // already-signed transaction to the Stellar horizon server.
        const stellarResult = await stellarServer.submitTransaction(signedTransaction);
        stellarTransactionId = stellarResult.hash;
        
        // Verify transaction was successful on the network
        const transactionRecord = await stellarServer.transactions()
          .transaction(stellarTransactionId)
          .call();

        if (!transactionRecord.successful) {
          throw new Error('Stellar transaction failed on network');
        }

        paymentResult = {
          ...await billingService.processPayment({
            billId,
            userId,
            amount,
            paymentMethod,
            timestamp: new Date(),
            transactionId: stellarTransactionId || transactionId
          }),
          stellarTransactionId,
          network: 'testnet'
        };

        transactionStatus.status = 'completed';
        transactionStatus.stellarTransactionId = stellarTransactionId;
        await cacheManager.set(`transaction:${transactionId}`, transactionStatus, { ttl: TRANSACTION_TTL, tags: ['transaction', `user:${userId}`] });

      } catch (stellarError: any) {
        console.error('Stellar payment error:', stellarError);
        transactionStatus.status = 'failed';
        transactionStatus.errorMessage = stellarError.message || 'Stellar transaction failed';
        await cacheManager.set(`transaction:${transactionId}`, transactionStatus, { ttl: TRANSACTION_TTL, tags: ['transaction', `user:${userId}`] });
      
          return res.status(400).json({
            status: 400,
            error: 'Stellar payment processing failed',
            details: stellarError.message,
            transactionId
          });
      }
    } else {
      // Handle traditional payment methods
        paymentResult = await billingService.processPayment({
          billId,
          userId,
          amount,
          paymentMethod,
          timestamp: new Date(),
          transactionId
        });
        transactionStatus.status = 'completed';
        await cacheManager.set(`transaction:${transactionId}`, transactionStatus, { ttl: TRANSACTION_TTL, tags: ['transaction', `user:${userId}`] });
    }
    
    transactionStatus.updatedAt = new Date();
    
    // Invalidate user cache and payment cache after payment processing
    await invalidateUserCache(userId);
    await invalidateCacheByPattern('payment');
    
    res.status(200).json({
      status: 200,
      message: 'Payment processed successfully',
      data: {
        ...paymentResult,
        transactionId,
        status: transactionStatus.status,
        stellarTransactionId
      }
    });
    
  } catch (error: any) {
    console.error('Payment processing error:', error);
    
    // Update transaction status to failed (persist to Redis)
    try {
      const failedTransaction = await cacheManager.get<TransactionStatus>(`transaction:${transactionId}`);
      if (failedTransaction) {
        failedTransaction.status = 'failed';
        failedTransaction.errorMessage = error.message || 'Unknown error';
        failedTransaction.updatedAt = new Date();
        await cacheManager.set(`transaction:${transactionId}`, failedTransaction, { ttl: TRANSACTION_TTL, tags: ['transaction', `user:${userId}`] });
      }
    } catch (e) {
      console.error('Failed to update failed transaction in cache:', e);
    }
    
    res.status(500).json({
      status: 500,
      error: 'Payment processing failed',
      message: error.message,
      transactionId
    });
  }
};

/**
 * @openapi
 * /api/payment/history:
 *   get:
 *     summary: Get payment history for a user
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Payment history retrieved successfully
 */
export const getPaymentHistory = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = parseInt(req.query.offset as string) || 0;
    
    if (!userId) {
      return res.status(401).json({
        status: 401,
        error: 'User authentication required'
      });
    }
    
    const paymentHistory = await billingService.getPaymentHistory(userId, limit, offset);
    
    res.status(200).json({
      status: 200,
      data: paymentHistory.payments,
      pagination: paymentHistory.pagination
    });
    
  } catch (error) {
    console.error('Payment history error:', error);
    res.status(500).json({
      status: 500,
      error: 'Failed to retrieve payment history'
    });
  }
};

/**
 * @openapi
 * /api/payment/validate:
 *   post:
 *     summary: Validate payment data before processing
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               billId:
 *                 type: string
 *               amount:
 *                 type: number
 *     responses:
 *       200:
 *         description: Payment data is valid
 */
export const validatePayment = async (req: Request, res: Response) => {
  try {
    const { billId, amount } = req.body;
    const userId = (req as any).user?.id;
    
    if (!userId) {
      return res.status(401).json({
        status: 401,
        error: 'User authentication required'
      });
    }
    
    // Validate bill exists and belongs to user
    const bill = await billingService.getBill(billId);
    if (!bill || bill.userId !== userId) {
      return res.status(404).json({
        status: 404,
        error: 'Bill not found or access denied'
      });
    }
    
    // Validate amount
    if (amount <= 0 || amount > Number(bill.amount) + Number(bill.lateFee || 0)) {
      return res.status(400).json({
        status: 400,
        error: 'Invalid payment amount'
      });
    }
    
    res.status(200).json({
      status: 200,
      message: 'Payment data is valid',
      data: {
        billAmount: bill.amount,
        lateFee: bill.lateFee,
        totalDue: Number(bill.amount) + Number(bill.lateFee || 0)
      }
    });
    
  } catch (error) {
    console.error('Payment validation error:', error);
    res.status(500).json({
      status: 500,
      error: 'Payment validation failed'
    });
  }
};

/**
 * @openapi
 * /api/payment/status/{transactionId}:
 *   get:
 *     summary: Get transaction status
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: transactionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Transaction status retrieved successfully
 *       404:
 *         description: Transaction not found
 */
export const getTransactionStatus = async (req: Request, res: Response) => {
  try {
    const { transactionId } = req.params;
    const userId = (req as any).user?.id;
    
    if (!userId) {
      return res.status(401).json({
        status: 401,
        error: 'User authentication required'
      });
    }
    
    // First try Redis (active transactions)
    const transaction = await cacheManager.get<TransactionStatus>(`transaction:${transactionId}`);

    if (transaction) {
      if (transaction.userId !== userId) {
        return res.status(404).json({ status: 404, error: 'Transaction not found or access denied' });
      }

      // For Stellar transactions, check network status when processing
      if (transaction.stellarTransactionId && transaction.status === 'processing') {
        try {
          const stellarTx = await stellarServer.transactions()
            .transaction(transaction.stellarTransactionId)
            .call();

          if (stellarTx.successful) {
            transaction.status = 'completed';
            transaction.updatedAt = new Date();
            await cacheManager.set(`transaction:${transactionId}`, transaction, { ttl: TRANSACTION_TTL, tags: ['transaction', `user:${userId}`] });
          } else if ((stellarTx as any).status === 'failed') {
            transaction.status = 'failed';
            transaction.errorMessage = 'Stellar transaction failed on network';
            transaction.updatedAt = new Date();
            await cacheManager.set(`transaction:${transactionId}`, transaction, { ttl: TRANSACTION_TTL, tags: ['transaction', `user:${userId}`] });
          }
        } catch (error) {
          console.error('Error checking Stellar transaction:', error);
        }
      }

      return res.status(200).json({ status: 200, data: transaction });
    }

    // If not in Redis, fall back to persisted payments in DB
    const paymentRecord: any = await billingService.getPaymentByTransactionId(transactionId);
    if (!paymentRecord || paymentRecord.userId !== userId) {
      return res.status(404).json({ status: 404, error: 'Transaction not found or access denied' });
    }

    // Map payment record to TransactionStatus-lite response
    const fromDb: TransactionStatus = {
      id: transactionId,
      userId: paymentRecord.userId,
      billId: paymentRecord.billId,
      amount: Number(paymentRecord.amount),
      paymentMethod: paymentRecord.method,
      stellarTransactionId: paymentRecord.transactionId,
      status: paymentRecord.status === 'SUCCESS' ? 'completed' : 'failed',
      createdAt: paymentRecord.createdAt,
      updatedAt: paymentRecord.updatedAt
    };

    return res.status(200).json({ status: 200, data: fromDb });
    
  } catch (error) {
    console.error('Transaction status error:', error);
    res.status(500).json({
      status: 500,
      error: 'Failed to retrieve transaction status'
    });
  }
};

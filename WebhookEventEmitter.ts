import { EventEmitter } from 'events';
import { webhookService } from './WebhookService';
import { logger } from './logger';

/**
 * Event Types
 */
export enum WebhookEventType {
  PAYMENT_SUCCESS = 'payment.success',
  PAYMENT_FAILED = 'payment.failed',
  BILL_CREATED = 'bill.created',
  BILL_PAID = 'bill.paid',
  BILL_OVERDUE = 'bill.overdue',
  BILL_UPDATED = 'bill.updated',
  USER_CREATED = 'user.created',
  USER_UPDATED = 'user.updated',
  DOCUMENT_UPLOADED = 'document.uploaded',
  REPORT_GENERATED = 'report.generated',
}

/**
 * Event Payload Types
 */
interface PaymentEvent {
  paymentId: string;
  userId: string;
  billId: string;
  amount: number;
  method: string;
  transactionId?: string;
  timestamp: number;
}

interface BillEvent {
  billId: string;
  userId: string;
  utilityId: string;
  amount: number;
  dueDate: string;
  status: string;
  timestamp: number;
}

interface UserEvent {
  userId: string;
  email: string;
  name?: string;
  timestamp: number;
}

interface DocumentEvent {
  documentId: string;
  userId: string;
  filename: string;
  mimeType: string;
  size: number;
  timestamp: number;
}

interface ReportEvent {
  reportId: string;
  userId: string;
  title: string;
  type: string;
  timestamp: number;
}

/**
 * Global Event Emitter for Webhook System
 */
class WebhookEventEmitter extends EventEmitter {
  private static instance: WebhookEventEmitter;

  private constructor() {
    super();
    this.setupListeners();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): WebhookEventEmitter {
    if (!WebhookEventEmitter.instance) {
      WebhookEventEmitter.instance = new WebhookEventEmitter();
    }
    return WebhookEventEmitter.instance;
  }

  /**
   * Setup event listeners
   */
  private setupListeners(): void {
    // Payment events
    this.on(WebhookEventType.PAYMENT_SUCCESS, (data: PaymentEvent) => {
      this.handlePaymentSuccess(data);
    });

    this.on(WebhookEventType.PAYMENT_FAILED, (data: PaymentEvent) => {
      this.handlePaymentFailed(data);
    });

    // Bill events
    this.on(WebhookEventType.BILL_CREATED, (data: BillEvent) => {
      this.handleBillCreated(data);
    });

    this.on(WebhookEventType.BILL_PAID, (data: BillEvent) => {
      this.handleBillPaid(data);
    });

    this.on(WebhookEventType.BILL_OVERDUE, (data: BillEvent) => {
      this.handleBillOverdue(data);
    });

    this.on(WebhookEventType.BILL_UPDATED, (data: BillEvent) => {
      this.handleBillUpdated(data);
    });

    // User events
    this.on(WebhookEventType.USER_CREATED, (data: UserEvent) => {
      this.handleUserCreated(data);
    });

    this.on(WebhookEventType.USER_UPDATED, (data: UserEvent) => {
      this.handleUserUpdated(data);
    });

    // Document events
    this.on(WebhookEventType.DOCUMENT_UPLOADED, (data: DocumentEvent) => {
      this.handleDocumentUploaded(data);
    });

    // Report events
    this.on(WebhookEventType.REPORT_GENERATED, (data: ReportEvent) => {
      this.handleReportGenerated(data);
    });
  }

  // Event Handlers
  private async handlePaymentSuccess(data: PaymentEvent): Promise<void> {
    try {
      await webhookService.triggerWebhook(WebhookEventType.PAYMENT_SUCCESS, data);
      logger.info(`Payment success webhook triggered for payment ${data.paymentId}`);
    } catch (error) {
      logger.error(`Error triggering payment success webhook: ${error}`);
    }
  }

  private async handlePaymentFailed(data: PaymentEvent): Promise<void> {
    try {
      await webhookService.triggerWebhook(WebhookEventType.PAYMENT_FAILED, data);
      logger.info(`Payment failed webhook triggered for payment ${data.paymentId}`);
    } catch (error) {
      logger.error(`Error triggering payment failed webhook: ${error}`);
    }
  }

  private async handleBillCreated(data: BillEvent): Promise<void> {
    try {
      await webhookService.triggerWebhook(WebhookEventType.BILL_CREATED, data);
      logger.info(`Bill created webhook triggered for bill ${data.billId}`);
    } catch (error) {
      logger.error(`Error triggering bill created webhook: ${error}`);
    }
  }

  private async handleBillPaid(data: BillEvent): Promise<void> {
    try {
      await webhookService.triggerWebhook(WebhookEventType.BILL_PAID, data);
      logger.info(`Bill paid webhook triggered for bill ${data.billId}`);
    } catch (error) {
      logger.error(`Error triggering bill paid webhook: ${error}`);
    }
  }

  private async handleBillOverdue(data: BillEvent): Promise<void> {
    try {
      await webhookService.triggerWebhook(WebhookEventType.BILL_OVERDUE, data);
      logger.info(`Bill overdue webhook triggered for bill ${data.billId}`);
    } catch (error) {
      logger.error(`Error triggering bill overdue webhook: ${error}`);
    }
  }

  private async handleBillUpdated(data: BillEvent): Promise<void> {
    try {
      await webhookService.triggerWebhook(WebhookEventType.BILL_UPDATED, data);
      logger.info(`Bill updated webhook triggered for bill ${data.billId}`);
    } catch (error) {
      logger.error(`Error triggering bill updated webhook: ${error}`);
    }
  }

  private async handleUserCreated(data: UserEvent): Promise<void> {
    try {
      await webhookService.triggerWebhook(WebhookEventType.USER_CREATED, data);
      logger.info(`User created webhook triggered for user ${data.userId}`);
    } catch (error) {
      logger.error(`Error triggering user created webhook: ${error}`);
    }
  }

  private async handleUserUpdated(data: UserEvent): Promise<void> {
    try {
      await webhookService.triggerWebhook(WebhookEventType.USER_UPDATED, data);
      logger.info(`User updated webhook triggered for user ${data.userId}`);
    } catch (error) {
      logger.error(`Error triggering user updated webhook: ${error}`);
    }
  }

  private async handleDocumentUploaded(data: DocumentEvent): Promise<void> {
    try {
      await webhookService.triggerWebhook(WebhookEventType.DOCUMENT_UPLOADED, data);
      logger.info(`Document uploaded webhook triggered for document ${data.documentId}`);
    } catch (error) {
      logger.error(`Error triggering document uploaded webhook: ${error}`);
    }
  }

  private async handleReportGenerated(data: ReportEvent): Promise<void> {
    try {
      await webhookService.triggerWebhook(WebhookEventType.REPORT_GENERATED, data);
      logger.info(`Report generated webhook triggered for report ${data.reportId}`);
    } catch (error) {
      logger.error(`Error triggering report generated webhook: ${error}`);
    }
  }

  // Public event emission methods

  /**
   * Emit payment success event
   */
  emitPaymentSuccess(data: PaymentEvent): void {
    this.emit(WebhookEventType.PAYMENT_SUCCESS, data);
  }

  /**
   * Emit payment failed event
   */
  emitPaymentFailed(data: PaymentEvent): void {
    this.emit(WebhookEventType.PAYMENT_FAILED, data);
  }

  /**
   * Emit bill created event
   */
  emitBillCreated(data: BillEvent): void {
    this.emit(WebhookEventType.BILL_CREATED, data);
  }

  /**
   * Emit bill paid event
   */
  emitBillPaid(data: BillEvent): void {
    this.emit(WebhookEventType.BILL_PAID, data);
  }

  /**
   * Emit bill overdue event
   */
  emitBillOverdue(data: BillEvent): void {
    this.emit(WebhookEventType.BILL_OVERDUE, data);
  }

  /**
   * Emit bill updated event
   */
  emitBillUpdated(data: BillEvent): void {
    this.emit(WebhookEventType.BILL_UPDATED, data);
  }

  /**
   * Emit user created event
   */
  emitUserCreated(data: UserEvent): void {
    this.emit(WebhookEventType.USER_CREATED, data);
  }

  /**
   * Emit user updated event
   */
  emitUserUpdated(data: UserEvent): void {
    this.emit(WebhookEventType.USER_UPDATED, data);
  }

  /**
   * Emit document uploaded event
   */
  emitDocumentUploaded(data: DocumentEvent): void {
    this.emit(WebhookEventType.DOCUMENT_UPLOADED, data);
  }

  /**
   * Emit report generated event
   */
  emitReportGenerated(data: ReportEvent): void {
    this.emit(WebhookEventType.REPORT_GENERATED, data);
  }
}

export const webhookEventEmitter = WebhookEventEmitter.getInstance();

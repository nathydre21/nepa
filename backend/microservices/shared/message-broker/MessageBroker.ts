import amqp, { Channel, Connection, Message } from 'amqplib';

export interface MessageBrokerConfig {
  url: string;
  exchange: string;
  exchangeType: 'direct' | 'topic' | 'fanout' | 'headers';
  queue?: string;
  durable?: boolean;
}

export interface EventPayload {
  eventType: string;
  eventId: string;
  timestamp: string;
  version: string;
  source: string;
  data: any;
  correlationId?: string;
  replyTo?: string;
}

export class MessageBroker {
  private connection: Connection | null = null;
  private channel: Channel | null = null;
  private config: MessageBrokerConfig;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 5000;

  constructor(config: MessageBrokerConfig) {
    this.config = {
      durable: true,
      ...config
    };
  }

  async connect(): Promise<void> {
    try {
      this.connection = await amqp.connect(this.config.url);
      this.channel = await this.connection.createChannel();
      
      await this.channel.assertExchange(
        this.config.exchange,
        this.config.exchangeType,
        { durable: this.config.durable }
      );

      this.connection.on('error', (error) => {
        console.error('RabbitMQ connection error:', error);
        this.handleReconnect();
      });

      this.connection.on('close', () => {
        console.log('RabbitMQ connection closed');
        this.handleReconnect();
      });

      console.log(`Connected to RabbitMQ exchange: ${this.config.exchange}`);
      this.reconnectAttempts = 0;
    } catch (error) {
      console.error('Failed to connect to RabbitMQ:', error);
      await this.handleReconnect();
    }
  }

  private async handleReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
    
    await new Promise(resolve => setTimeout(resolve, this.reconnectDelay));
    
    try {
      await this.connect();
    } catch (error) {
      console.error('Reconnection failed:', error);
    }
  }

  async publish(
    routingKey: string,
    event: EventPayload,
    options?: amqp.Options.Publish
  ): Promise<boolean> {
    if (!this.channel) {
      console.error('Channel not connected');
      return false;
    }

    try {
      const published = this.channel.publish(
        this.config.exchange,
        routingKey,
        Buffer.from(JSON.stringify(event)),
        {
          persistent: true,
          timestamp: Date.now(),
          ...options
        }
      );

      if (published) {
        console.log(`Event published: ${event.eventType} to ${routingKey}`);
      }

      return published;
    } catch (error) {
      console.error('Failed to publish event:', error);
      return false;
    }
  }

  async subscribe(
    routingKey: string,
    queueName: string,
    handler: (message: EventPayload, rawMessage: Message) => void | Promise<void>,
    options?: amqp.Options.AssertQueue
  ): Promise<void> {
    if (!this.channel) {
      console.error('Channel not connected');
      return;
    }

    try {
      await this.channel.assertQueue(queueName, {
        durable: true,
        ...options
      });

      await this.channel.bindQueue(queueName, this.config.exchange, routingKey);

      await this.channel.consume(queueName, async (message) => {
        if (!message) return;

        try {
          const content = JSON.parse(message.content.toString()) as EventPayload;
          
          await handler(content, message);
          
          this.channel!.ack(message);
          console.log(`Event processed: ${content.eventType} from ${routingKey}`);
        } catch (error) {
          console.error('Failed to process message:', error);
          this.channel!.nack(message, false, false); // Don't requeue on error
        }
      });

      console.log(`Subscribed to ${routingKey} with queue ${queueName}`);
    } catch (error) {
      console.error('Failed to subscribe:', error);
    }
  }

  async createDeadLetterQueue(originalQueue: string): Promise<void> {
    if (!this.channel) {
      console.error('Channel not connected');
      return;
    }

    const deadLetterQueue = `${originalQueue}.dlq`;
    const deadLetterExchange = `${this.config.exchange}.dlq`;

    try {
      // Create dead letter exchange
      await this.channel.assertExchange(deadLetterExchange, 'direct', { durable: true });

      // Create dead letter queue
      await this.channel.assertQueue(deadLetterQueue, { durable: true });

      // Bind dead letter queue to dead letter exchange
      await this.channel.bindQueue(deadLetterQueue, deadLetterExchange, originalQueue);

      console.log(`Dead letter queue created: ${deadLetterQueue}`);
    } catch (error) {
      console.error('Failed to create dead letter queue:', error);
    }
  }

  async close(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
      console.log('RabbitMQ connection closed');
    } catch (error) {
      console.error('Error closing RabbitMQ connection:', error);
    }
  }

  isConnected(): boolean {
    return this.connection !== null && this.channel !== null;
  }
}

// Singleton instance for each service
const messageBrokers: Map<string, MessageBroker> = new Map();

export function getMessageBroker(serviceName: string): MessageBroker {
  if (!messageBrokers.has(serviceName)) {
    const config: MessageBrokerConfig = {
      url: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
      exchange: `${serviceName}.events`,
      exchangeType: 'topic'
    };
    
    const broker = new MessageBroker(config);
    messageBrokers.set(serviceName, broker);
  }
  
  return messageBrokers.get(serviceName)!;
}

export function generateEventId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function createEvent(
  eventType: string,
  source: string,
  data: any,
  version: string = '1.0.0'
): EventPayload {
  return {
    eventType,
    eventId: generateEventId(),
    timestamp: new Date().toISOString(),
    version,
    source,
    data
  };
}

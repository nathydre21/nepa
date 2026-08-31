# Microservices Architecture

## Overview

This document defines the formal microservices architecture for the NEPA application, including service boundaries, communication patterns, resilience mechanisms, and deployment infrastructure.

## Table of Contents

1. [Service Boundaries](#service-boundaries)
2. [Architecture Diagram](#architecture-diagram)
3. [Inter-Service Communication](#inter-service-communication)
4. [Service Discovery](#service-discovery)
5. [Circuit Breakers](#circuit-breakers)
6. [Health Checks](#health-checks)
7. [Data Management](#data-management)
8. [Security](#security)
9. [Deployment](#deployment)

## Service Boundaries

### Core Services

#### 1. API Gateway (Port 3000)
**Responsibilities:**
- Request routing and load balancing
- Authentication and authorization
- Rate limiting
- Request/response transformation
- API composition
- Caching

**Owned Data:** None (stateless)

**Dependencies:**
- User Service (authentication)
- All downstream services

**Communication Pattern:** HTTP/REST, WebSocket

---

#### 2. User Service (Port 3001)
**Responsibilities:**
- User registration and authentication
- User profile management
- Role-based access control (RBAC)
- Session management
- 2FA management
- Password reset

**Owned Data:**
- Users
- User profiles
- User sessions
- Roles and permissions
- Password reset tokens
- Audit logs

**Dependencies:**
- Notification Service (email/SMS notifications)
- Audit Service (audit logging)

**Communication Pattern:** HTTP/REST, AMQP (events)

**Published Events:**
- `user.created`
- `user.updated`
- `user.deleted`
- `user.login`
- `user.logout`
- `user.password_changed`

**Subscribed Events:**
- None

---

#### 3. Billing Service (Port 3003)
**Responsibilities:**
- Bill generation and management
- Bill payment processing
- Invoice generation
- Payment history
- Billing analytics

**Owned Data:**
- Bills
- Invoices
- Payment records
- Billing configurations

**Dependencies:**
- User Service (user validation)
- Payment Service (payment processing)
- Notification Service (billing notifications)
- Audit Service (audit logging)

**Communication Pattern:** HTTP/REST, AMQP (events), WebSocket (real-time updates)

**Published Events:**
- `bill.created`
- `bill.updated`
- `bill.paid`
- `bill.overdue`
- `invoice.generated`

**Subscribed Events:**
- `payment.completed`
- `user.deleted` (cleanup)

---

#### 4. Notification Service (Port 3004)
**Responsibilities:**
- Email notifications
- SMS notifications
- Push notifications
- In-app notifications
- Notification templates
- Notification preferences

**Owned Data:**
- Notifications
- Notification templates
- Notification preferences
- Delivery logs

**Dependencies:**
- User Service (user contact info)
- External services (SendGrid, Twilio, Firebase)

**Communication Pattern:** HTTP/REST, AMQP (events)

**Published Events:**
- `notification.sent`
- `notification.failed`
- `notification.delivered`

**Subscribed Events:**
- `user.created` (welcome email)
- `bill.created` (bill notification)
- `bill.overdue` (overdue reminder)
- `payment.completed` (payment confirmation)
- `user.password_changed` (security alert)

---

#### 5. Webhook Service (Port 3008)
**Responsibilities:**
- Webhook registration and management
- Webhook delivery
- Webhook retry logic
- Webhook signature verification
- Webhook event filtering

**Owned Data:**
- Webhooks
- Webhook delivery logs
- Webhook signatures

**Dependencies:**
- User Service (webhook owner validation)
- Audit Service (audit logging)

**Communication Pattern:** HTTP/REST, AMQP (events)

**Published Events:**
- `webhook.delivered`
- `webhook.failed`
- `webhook.retried`

**Subscribed Events:**
- `bill.created`
- `bill.paid`
- `user.created`
- `payment.completed`

---

#### 6. Audit Service (Port 3009)
**Responsibilities:**
- Audit log aggregation
- Audit log storage
- Audit log querying
- Compliance reporting
- Security event monitoring

**Owned Data:**
- Audit logs (aggregated from all services)
- Compliance reports
- Security events

**Dependencies:**
- All services (audit log ingestion)

**Communication Pattern:** HTTP/REST, AMQP (events)

**Published Events:**
- `audit.alert`
- `compliance.violation`

**Subscribed Events:**
- `user.created`
- `user.deleted`
- `user.login`
- `bill.created`
- `payment.completed`
- All security-relevant events

---

### Supporting Services

#### 7. Payment Service (Port 3002)
**Responsibilities:**
- Payment processing
- Payment gateway integration
- Refund processing
- Payment reconciliation
- Transaction logging

**Owned Data:**
- Payments
- Refunds
- Transactions
- Payment gateway configurations

**Dependencies:**
- User Service (user validation)
- Billing Service (bill updates)
- External payment gateways (Stripe, PayPal)

**Communication Pattern:** HTTP/REST, AMQP (events)

**Published Events:**
- `payment.initiated`
- `payment.completed`
- `payment.failed`
- `payment.refunded`

**Subscribed Events:**
- `bill.created` (auto-pay)

---

#### 8. Document Service (Port 3005)
**Responsibilities:**
- Document storage
- Document retrieval
- Document conversion
- Document sharing
- Document versioning

**Owned Data:**
- Documents
- Document metadata
- Document versions
- Document permissions

**Dependencies:**
- User Service (access control)
- External storage (S3, Azure Blob)

**Communication Pattern:** HTTP/REST, AMQP (events)

**Published Events:**
- `document.uploaded`
- `document.shared`
- `document.deleted`

**Subscribed Events:**
- `user.deleted` (cleanup)

---

#### 9. Utility Service (Port 3006)
**Responsibilities:**
- Utility provider management
- Utility rate management
- Usage tracking
- Utility consumption analytics

**Owned Data:**
- Utility providers
- Utility rates
- Usage records
- Consumption data

**Dependencies:**
- User Service (user validation)
- Billing Service (billing integration)

**Communication Pattern:** HTTP/REST, AMQP (events)

**Published Events:**
- `usage.recorded`
- `utility.rate.changed`
- `utility.provider.updated`

**Subscribed Events:**
- `user.deleted` (cleanup)

---

#### 10. Analytics Service (Port 3007)
**Responsibilities:**
- Data aggregation
- Analytics reporting
- Dashboard data
- Business intelligence
- Predictive analytics

**Owned Data:**
- Analytics data (aggregated)
- Reports
- Dashboard configurations
- ML models

**Dependencies:**
- All services (data ingestion)
- External analytics tools

**Communication Pattern:** HTTP/REST, AMQP (events)

**Published Events:**
- `report.generated`
- `anomaly.detected`

**Subscribed Events:**
- All business events for aggregation

---

#### 11. Event Consumer (Background)
**Responsibilities:**
- Event processing
- Event replay
- Dead letter queue handling
- Event aggregation

**Owned Data:** None (stateless)

**Dependencies:**
- Message broker (RabbitMQ)
- All services (event consumption)

**Communication Pattern:** AMQP (events only)

**Published Events:** None

**Subscribed Events:**
- All events for processing

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         API Gateway                             │
│                    (Port 3000)                                  │
│  Authentication, Routing, Rate Limiting, Caching                 │
└─────────────────────────────────────────────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
        ▼                           ▼                           ▼
┌───────────────┐         ┌───────────────┐         ┌───────────────┐
│ User Service  │         │Billing Service│         │Payment Service│
│   (3001)      │         │    (3003)     │         │    (3002)     │
└───────────────┘         └───────────────┘         └───────────────┘
        │                           │                           │
        └───────────────────────────┼───────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                    ▼                               ▼
            ┌───────────────┐             ┌───────────────┐
            │Notification   │             │  Webhook      │
            │  Service      │             │  Service      │
            │   (3004)      │             │   (3008)      │
            └───────────────┘             └───────────────┘
                    │                               │
                    └───────────────┬───────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                    ▼                               ▼
            ┌───────────────┐             ┌───────────────┐
            │  Audit Service│             │  Document     │
            │   (3009)      │             │  Service      │
            └───────────────┘             │   (3005)      │
                    │                     └───────────────┘
                    │                               │
                    └───────────────┬───────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                    ▼                               ▼
            ┌───────────────┐             ┌───────────────┐
            │  Utility      │             │  Analytics    │
            │  Service      │             │  Service      │
            │   (3006)      │             │   (3007)      │
            └───────────────┘             └───────────────┘
                    │
                    ▼
            ┌───────────────┐
            │ Event Consumer│
            │  (Background) │
            └───────────────┘

                    ┌───────────────┐
                    │  RabbitMQ     │
                    │  Message     │
                    │  Broker      │
                    └───────────────┘
```

## Inter-Service Communication

### Communication Patterns

#### 1. Synchronous Communication (HTTP/REST)
**Use Cases:**
- Request/response operations
- Real-time data retrieval
- User-facing API calls

**Implementation:**
- RESTful APIs
- JSON request/response
- Standard HTTP status codes
- Timeout handling (default 5s)

**Example:**
```typescript
// Billing Service calling User Service
const response = await fetch('http://user-service:3001/api/users/123', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  timeout: 5000
});
```

#### 2. Asynchronous Communication (AMQP/RabbitMQ)
**Use Cases:**
- Event-driven operations
- Decoupled services
- Background processing
- Fan-out notifications

**Implementation:**
- RabbitMQ message broker
- Event-driven architecture
- Dead letter queues
- Message persistence

**Exchange Types:**
- **Direct:** Point-to-point communication
- **Topic:** Pattern-based routing
- **Fanout:** Broadcast to all consumers
- **Headers:** Complex routing rules

**Example:**
```typescript
// Publishing an event
await messageBroker.publish('billing.events', 'bill.created', {
  billId: 'bill-123',
  userId: 'user-123',
  amount: 100.00,
  timestamp: new Date().toISOString()
});

// Consuming events
await messageBroker.subscribe('billing.events', 'bill.created', async (message) => {
  console.log('Bill created:', message.content);
  await processBillCreated(message.content);
});
```

#### 3. Real-time Communication (WebSocket)
**Use Cases:**
- Live updates
- Real-time notifications
- Dashboard data streaming

**Implementation:**
- Socket.IO
- Room-based broadcasting
- Event-based communication

**Example:**
```typescript
// Billing Service broadcasting bill updates
io.emit('bill_updated', {
  billId: 'bill-123',
  status: 'paid',
  amount: 100.00
});
```

### Message Broker Configuration

**RabbitMQ Setup:**
- Virtual host: `/nepa`
- Exchanges:
  - `user.events` (Topic)
  - `billing.events` (Topic)
  - `payment.events` (Topic)
  - `notification.events` (Topic)
  - `webhook.events` (Topic)
  - `audit.events` (Topic)
- Queues:
  - Each service has its own queue
  - Dead letter queue for failed messages
- Durability: All queues and exchanges are durable

### Event Schema

**Standard Event Format:**
```typescript
interface Event {
  eventType: string;
  eventId: string;
  timestamp: string;
  version: string;
  source: string;
  data: any;
  correlationId?: string;
  replyTo?: string;
}
```

## Service Discovery

### Implementation

**Consul-based Service Discovery:**

```typescript
// Service Registration
import Consul from 'consul';

const consul = new Consul();

await consul.agent.service.register({
  name: 'user-service',
  id: 'user-service-1',
  port: 3001,
  check: {
    http: 'http://localhost:3001/health',
    interval: '10s',
    timeout: '5s'
  }
});

// Service Discovery
const services = await consul.agent.service.list();
const userService = services['user-service'];
const instance = userService[0];

// Make request to discovered service
const response = await fetch(`http://${instance.Address}:${instance.Port}/api/users/123`);
```

**Health Check Endpoints:**

Each service exposes a `/health` endpoint:

```typescript
app.get('/health', (req, res) => {
  res.json({
    status: 'UP',
    service: 'user-service',
    timestamp: new Date().toISOString(),
    checks: {
      database: 'UP',
      messageBroker: 'UP',
      redis: 'UP'
    }
  });
});
```

**Service Registry:**

The API Gateway maintains a service registry:

```typescript
class ServiceRegistry {
  private services: Map<string, ServiceInstance[]> = new Map();

  register(serviceName: string, instance: ServiceInstance) {
    if (!this.services.has(serviceName)) {
      this.services.set(serviceName, []);
    }
    this.services.get(serviceName)!.push(instance);
  }

  discover(serviceName: string): ServiceInstance | null {
    const instances = this.services.get(serviceName);
    if (!instances || instances.length === 0) return null;
    
    // Round-robin load balancing
    const instance = instances[Math.floor(Math.random() * instances.length)];
    return instance;
  }

  deregister(serviceName: string, instanceId: string) {
    const instances = this.services.get(serviceName);
    if (instances) {
      const index = instances.findIndex(i => i.id === instanceId);
      if (index !== -1) {
        instances.splice(index, 1);
      }
    }
  }
}
```

## Circuit Breakers

### Implementation

**Using Opossum Circuit Breaker:**

```typescript
import CircuitBreaker from 'opposum';

// Create circuit breaker for external service calls
const userServiceBreaker = new CircuitBreaker(
  async (userId: string) => {
    const response = await fetch(`http://user-service:3001/api/users/${userId}`);
    return response.json();
  },
  {
    timeout: 5000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000,
    rollingCountTimeout: 10000,
    rollingCountBuckets: 10
  }
);

// Circuit breaker events
userServiceBreaker.on('open', () => {
  console.log('User service circuit breaker OPEN');
});

userServiceBreaker.on('halfOpen', () => {
  console.log('User service circuit breaker HALF_OPEN');
});

userServiceBreaker.on('close', () => {
  console.log('User service circuit breaker CLOSED');
});

// Use circuit breaker
try {
  const user = await userServiceBreaker.fire('user-123');
  console.log('User data:', user);
} catch (error) {
  console.error('Circuit breaker tripped:', error);
  // Fallback logic
  return getCachedUser('user-123');
}
```

**Circuit Breaker Configuration:**

```typescript
interface CircuitBreakerConfig {
  timeout: number;              // Request timeout in ms
  errorThresholdPercentage: number; // Error threshold to open circuit
  resetTimeout: number;        // Time before attempting to close circuit
  rollingCountTimeout: number; // Time window for error calculation
  rollingCountBuckets: number; // Number of buckets in rolling window
  volumeThreshold: number;     // Minimum requests before circuit can open
}
```

**Fallback Strategies:**

1. **Cache Fallback:** Return cached data
2. **Default Value:** Return safe default
3. **Alternative Service:** Call backup service
4. **Graceful Degradation:** Return partial functionality

## Health Checks

### Health Check Implementation

**Detailed Health Check Endpoint:**

```typescript
app.get('/health', async (req, res) => {
  const health = {
    status: 'UP',
    service: 'user-service',
    timestamp: new Date().toISOString(),
    checks: {
      database: await checkDatabase(),
      messageBroker: await checkMessageBroker(),
      redis: await checkRedis(),
      diskSpace: await checkDiskSpace(),
      memory: await checkMemory()
    },
    metrics: {
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage()
    }
  };

  const overallStatus = Object.values(health.checks).every(check => check.status === 'UP')
    ? 'UP'
    : 'DEGRADED';

  health.status = overallStatus;
  res.status(overallStatus === 'UP' ? 200 : 503).json(health);
});

async function checkDatabase() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'UP', latency: Date.now() - startTime };
  } catch (error) {
    return { status: 'DOWN', error: error.message
 };
  }
}
```

**Health Check Types:**

1. **Liveness Probe:** Is the service running?
2. **Readiness Probe:** Is the service ready to accept traffic?
3. **Startup Probe:** Is the service starting up?

**Kubernetes Health Checks:**

```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 3001
  initialDelaySeconds: 30
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /health/ready
    port: 3001
  initialDelaySeconds: 5
  periodSeconds: 5
```

## Data Management

### Database per Service Pattern

Each service has its own database:

- **User Service:** `user_service_db`
- **Billing Service:** `billing_service_db`
- **Payment Service:** `payment_service_db`
- **Notification Service:** `notification_service_db`
- **Webhook Service:** `webhook_service_db`
- **Audit Service:** `audit_service_db`
- **Document Service:** `document_service_db`
- **Utility Service:** `utility_service_db`
- **Analytics Service:** `analytics_service_db`

### Data Consistency

**Eventual Consistency:**
- Services communicate via events
- Data is eventually consistent across services
- No distributed transactions

**Saga Pattern:**
- For complex transactions requiring coordination
- Compensating transactions for rollback
- Event choreography

**Example:**
```typescript
// Bill Payment Saga
async function processBillPayment(billId: string, paymentData: any) {
  try {
    // Step 1: Create payment
    const payment = await paymentService.createPayment(paymentData);
    
    // Step 2: Update bill status
    await billingService.updateBillStatus(billId, 'paid');
    
    // Step 3: Send notification
    await notificationService.sendPaymentConfirmation(payment);
    
    // Step 4: Log audit
    await auditService.logPaymentCompletion(payment);
    
  } catch (error) {
    // Compensating transactions
    await paymentService.refundPayment(payment.id);
    await billingService.updateBillStatus(billId, 'failed');
    throw error;
  }
}
```

## Security

### Authentication & Authorization

**JWT-based Authentication:**
- Tokens issued by User Service
- Validated by API Gateway
- Propagated to downstream services

**Service-to-Service Authentication:**
- Mutual TLS (mTLS) for service communication
- API keys for external service calls
- Service accounts for background processes

**Authorization:**
- RBAC implemented in User Service
- Permission checks in API Gateway
- Resource-level authorization in services

### Network Security

**Service Mesh:**
- Istio for service-to-service communication
- mTLS encryption
- Traffic policies
- Network policies

**API Security:**
- Rate limiting per service
- Request validation
- Input sanitization
- SQL injection prevention

## Deployment

### Docker Compose for Local Development

See `docker-compose.yml` for complete local development setup.

### Kubernetes Deployment

Each service has its own:
- Deployment
- Service
- ConfigMap
- Secret
- HorizontalPodAutoscaler

### Monitoring

**Metrics Collection:**
- Prometheus for metrics
- Grafana for dashboards
- Custom metrics per service

**Logging:**
- Structured logging (JSON)
- Centralized log aggregation (ELK stack)
- Log correlation with trace IDs

**Tracing:**
- Distributed tracing with Jaeger
- Request tracing across services
- Performance monitoring

---

**Version:** 1.0.0  
**Last Updated:** 2026-08-22  
**Maintainer:** Development Team

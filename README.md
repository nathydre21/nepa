# NEPA

> Decentralized utility payment platform powered by Stellar blockchain

[![CI Pipeline](https://github.com/DevScoopee/nepa/actions/workflows/ci.yml/badge.svg)](https://github.com/DevScoopee/nepa/actions/workflows/ci.yml)
[![Code Quality](https://github.com/DevScoopee/nepa/actions/workflows/code-quality.yml/badge.svg)](https://github.com/DevScoopee/nepa/actions/workflows/code-quality.yml)
[![Backend Coverage](https://codecov.io/github/DevScoopee/nepa/branch/main/graph/badge.svg?flag=backend)](https://codecov.io/github/DevScoopee/nepa)
[![Frontend Coverage](https://codecov.io/github/DevScoopee/nepa/branch/main/graph/badge.svg?flag=frontend)](https://codecov.io/github/DevScoopee/nepa)
[![codecov](https://codecov.io/github/DevScoopee/nepa/branch/main/graph/badge.svg)](https://codecov.io/github/DevScoopee/nepa)

A modern microservices platform enabling seamless electricity and water bill payments through blockchain technology.

## 📊 Code Coverage

Minimum coverage threshold: **70%** (lines, statements, functions, branches) enforced in CI via Jest `coverageThreshold` and [Codecov](https://codecov.io/github/DevScoopee/nepa).

| Area | Command | Report |
|------|---------|--------|
| Backend | `cd backend && npm run test:coverage` | `backend/coverage/lcov-report/index.html` |
| Frontend | `cd frontend && npm run test:coverage` | `frontend/coverage/lcov-report/index.html` |

Coverage trends are reported on every CI run (see the **Coverage Trend Report** job summary) and tracked historically on Codecov.

## 🏗️ Project Structure

```
nepa/
├── frontend/          # React frontend application
├── backend/           # Node.js API server
└── contract/          # Stellar smart contracts
```

## ✨ Features

- 🔐 **Secure Authentication** - JWT-based auth with 2FA support
- 💳 **Blockchain Payments** - Stellar integration for fast, low-cost transactions
- 📊 **Real-time Analytics** - Comprehensive dashboard with live metrics
- 🔔 **Smart Notifications** - Multi-channel notification system
- 📱 **Mobile Responsive** - Optimized for all devices
- 🚀 **High Performance** - Sub-second response times
- 🔒 **Enterprise Security** - Bank-grade security measures
- 📈 **Scalable Architecture** - Microservices with database-per-service

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Docker & Docker Compose
- PostgreSQL 14+
- Redis 6+
- Stellar testnet account

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/nepa.git
cd nepa

# Install backend dependencies
cd backend && npm install

# Install frontend dependencies
cd ../frontend && npm install

# Install contract dependencies
cd ../contract && npm install
```

### Environment Setup

```bash
# Backend environment
cd backend
cp .env.example .env
# Configure database URLs, Stellar keys, Redis connection, etc.

# Frontend environment
cd ../frontend
cp .env.example .env
# Configure API endpoints, etc.
```

### Running the Application

```bash
# Start backend (from backend directory)
npm run dev

# Start frontend (from frontend directory)
npm run dev

# Build contracts (from contract directory)
npm run build
```

## 📚 API Documentation

### Authentication

```bash
# Register user
POST /api/auth/register
{
  "email": "user@example.com",
  "password": "securePassword123",
  "firstName": "John",
  "lastName": "Doe"
}

# Login
POST /api/auth/login
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

### Payments

```bash
# Process payment
POST /api/payment/process
{
  "billId": "bill_123",
  "amount": 150.00,
  "method": "STELLAR"
}

# Get payment history
GET /api/payment/history?userId=user_123
```

## 🔧 Development

### Backend Scripts

```bash
# Development
npm run dev              # Start development server
npm run build            # Build for production
npm run start            # Start production server

# Database
npm run db:setup         # Initialize all databases
npm run db:migrate       # Run migrations
npm run db:seed          # Seed database with sample data

# Testing
npm test                 # Run all tests
npm run test:unit        # Unit tests only
npm run test:e2e         # End-to-end tests

# Quality
npm run lint            # Lint code
npm run type-check      # TypeScript checking
npm run test:coverage   # Coverage report
```

### Frontend Scripts

```bash
# Development
npm run dev            # Start development server
npm run build          # Build for production
npm run preview        # Preview production build

# Testing
npm test              # Run tests
npm run test:e2e       # End-to-end tests

# Quality
npm run lint         # Lint code
npm run type-check   # TypeScript checking
```

### Contract Scripts

```bash
# Build
npm run build        # Build smart contracts
npm run test         # Run contract tests
npm run deploy       # Deploy to network
```

## 🔒 Security

- **Authentication**: JWT with refresh tokens
- **Authorization**: Role-based access control (RBAC)
- **Encryption**: AES-256 for data at rest
- **API Security**: Rate limiting, input validation, CORS
- **Audit Trail**: Comprehensive logging of all actions

## 🛡️ Rate Limiting

The platform uses layered rate limiting backed by Redis for distributed enforcement. All limits are per IP by default; authenticated requests are additionally tracked per user ID.

### Default Limits by Endpoint

| Endpoint | Limit | Window | Notes |
|---|---|---|---|
| All API routes (global) | 100 requests | 15 minutes | General IP-based ceiling |
| `POST /api/auth/login` | 10 attempts | 15 minutes | Failed requests only; successes skipped |
| `POST /api/auth/register` | 3 requests | 1 hour | |
| `POST /api/payment/process` | 5 requests | 5 minutes | Keyed by IP + user ID |
| `POST /api/documents/upload` | 20 requests | 1 hour | |
| `GET /api/analytics/dashboard` | 100 requests | 15 minutes | Admin role only |
| Webhooks | 60 requests | 1 minute | |
| File exports | 10 requests | 15 minutes | |
| File downloads | 50 requests | 15 minutes | |

Requests that exceed a limit receive a `429 Too Many Requests` response with a `Retry-After` header indicating when the window resets.

### User Tiers

Authenticated users can be assigned a tier that raises their per-user ceiling:

| Tier | Requests per 15 min | Burst capacity |
|---|---|---|
| Free (default) | 100 | 20 |
| Basic | 500 | 100 |
| Premium | 2,000 | 400 |
| Enterprise | 10,000 | 2,000 |
| Unlimited | No limit | No limit |

Role multipliers also apply on top of tier limits: `ADMIN` accounts get 2× the tier limit; `SUPER_ADMIN` accounts get 5×. Write operations (`POST`, `PUT`, `PATCH`) consume 1.5× the weight of a `GET`; `DELETE` consumes 2×.

### Environment Variable Configuration

Core limits and behaviour can be overridden via environment variables (set in `backend/.env`):

```bash
# General API rate limiting
RATE_LIMIT_WINDOW_MS="900000"             # Window length in ms (default: 900000 = 15 min)
RATE_LIMIT_MAX_REQUESTS="100"             # Max requests per window per IP
RATE_LIMIT_SKIP_SUCCESSFUL_REQUESTS="false"
RATE_LIMIT_SKIP_FAILED_REQUESTS="false"
RATE_LIMIT_SKIP_TOKEN_REQUESTS="true"     # Skip limits for service-to-service token requests

# Per-scope overrides (SecurityConfig)
RATE_LIMIT_GLOBAL="1000"                  # Global ceiling across all users
RATE_LIMIT_GLOBAL_WINDOW_MS="900000"
RATE_LIMIT_PER_USER="500"                 # Per authenticated user
RATE_LIMIT_PER_USER_WINDOW_MS="900000"
RATE_LIMIT_PER_IP="100"                   # Per anonymous IP
RATE_LIMIT_PER_IP_WINDOW_MS="900000"

# Per-role ceilings
PREMIUM_USER_RATE_LIMIT="1000"
ADMIN_USER_RATE_LIMIT="500"
STANDARD_USER_RATE_LIMIT="100"
GUEST_USER_RATE_LIMIT="20"

# Toggles
SECURITY_RATE_LIMITING_ENABLED="true"     # Set to "false" to disable entirely (dev only)
SECURITY_STRICT_AUTH_LIMITS="true"
RATE_LIMIT_HEADERS_ENABLED="true"         # Send X-RateLimit-* headers in responses

# Abuse detection alerts (see below)
SLACK_WEBHOOK_URL="https://hooks.slack.com/..."

# Block a static list of IPs at startup
BLOCKED_IPS="1.2.3.4,5.6.7.8"
```

### Abuse Detection Middleware

Several middleware layers work together to detect and respond to abusive traffic:

**Progressive limiter** — each IP's effective limit scales down dynamically when suspicious signals are present (missing or very short `User-Agent`). Suspicious IPs are capped at 20 requests/minute instead of the normal 100/15 minutes.

**Behavioral analysis** — the `ComprehensiveRateLimitService` maintains a rolling abuse score (0–100) per IP in Redis, influenced by request volume, error rate, and prior breach count:

| Signal | Score contribution |
|---|---|
| > 1,000 requests in 24 h | +30 |
| > 50 errors in 24 h | +25 |
| > 5 prior breaches | +40 |
| > 100 req/min request rate | +20 |

An IP with a score above **80** is automatically blocked for 5 minutes and classified as a DDoS pattern. All breaches are stored in Redis for 7 days and are accessible via `GET /api/rate-limit/analytics` (admin only).

**Breach severity classification:**

- `MEDIUM` — limit exceeded for the first time
- `HIGH` — score > 50 or repeated breach
- `CRITICAL` — score > 70 or DDoS pattern detected

`HIGH` and `CRITICAL` breaches trigger a Slack alert when `SLACK_WEBHOOK_URL` is configured.

### Whitelisting IPs

Whitelisted IPs bypass all rate limit and block checks. The whitelist is stored in Redis and managed through the admin API:

```bash
# Add an IP to the whitelist (requires ADMIN role)
POST /api/rate-limit/ip-blocking/whitelist
Authorization: Bearer <admin_token>
Content-Type: application/json

{ "ip": "203.0.113.10" }

# Remove an IP from the whitelist
DELETE /api/rate-limit/ip-blocking/whitelist
{ "ip": "203.0.113.10" }
```

Use `*` as the IP value to whitelist all IPs (useful in local development). To block IPs statically without an API call, add them to the `BLOCKED_IPS` environment variable as a comma-separated list.

## 📄 License

MIT License - see the [LICENSE](LICENSE) file for details.

---

**Built with ❤️ for the future of utility payments**

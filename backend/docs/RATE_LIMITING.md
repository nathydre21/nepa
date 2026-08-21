# Rate Limiting Policies

This document outlines the rate limiting policies and configurations implemented in the NEPA backend API to protect against abuse, brute-force attacks, and distributed denial-of-service (DDoS) attacks.

## Overview

The rate limiting middleware uses `express-rate-limit` backed by a Redis store (`rate-limit-redis` and `ioredis`) to ensure that rate limits are enforced consistently across a distributed environment (e.g., multiple Node.js/Express instances).

## General Configuration

All rate limiters use Redis to track the number of requests made by a client. The client is typically identified by its IP address or a combination of its IP and user ID, ensuring granular and accurate rate limiting.

Headers are automatically included in the HTTP response to inform clients of their current rate limit status:
- `X-RateLimit-Limit`: Maximum number of requests allowed in the current window.
- `X-RateLimit-Remaining`: Number of requests remaining in the current window.
- `X-RateLimit-Reset`: Timestamp when the rate limit window will reset.

## Endpoint-Specific Policies

### 1. General API (`apiLimiter`)
Applied to most standard API endpoints to prevent general abuse.
- **Limit:** 100 requests
- **Window:** 15 minutes
- **Exemptions:** Health check endpoint (`/health`)

### 2. Authentication (`authLimiter`)
Applied to login, registration, and other authentication endpoints to mitigate brute-force attacks.
- **Limit:** 10 requests (only counts failed attempts or attempts regardless of success, depending on specific endpoint config)
- **Window:** 15 minutes
- **Note:** Stricter limits to protect user accounts.

### 3. Payment (`paymentLimiter`)
Applied to sensitive payment and transaction creation endpoints.
- **Limit:** 5 requests
- **Window:** 5 minutes
- **Identification:** Tracks by IP and User ID to prevent duplicate transaction spamming.

### 4. Transactions (`transactionLimiter`)
Applied to transaction processing and history endpoints.
- **Limit:** 20 requests
- **Window:** 1 hour

### 5. Progressive Limiter
Dynamically adjusts rate limits based on client behavior.
- **Window:** 1 minute
- **Normal Limit:** 30 requests
- **Suspicious Client Limit:** 5 requests
- **Note:** Flags requests as suspicious based on IP anomalies or missing/short User-Agent headers.

## Advanced Strategies

### DDoS Protection
A custom DDoS detection middleware monitors request frequency across all endpoints. If a single IP makes more than 100 requests within a 60-second window, it is flagged as a potential DDoS attack, and the IP is temporarily blocked for 5 minutes.

### Tiered & Adaptive Limiting
Additional rate limiting strategies (found in `RateLimiting.ts`) dynamically adjust limits based on:
- **System Load:** Reduces limits automatically when the system is under heavy load.
- **User Trust Score:** Users with verified emails, 2FA enabled, and older accounts receive higher rate limits.
- **Subscription Tier:** Premium users may be granted higher rate limits compared to free-tier users.

# Testing Suite

## Overview

- **Unit tests**: Jest (services, controllers, fraud, routes).
- **Integration tests**: Jest + supertest (API endpoints).
- **E2E tests**: Playwright (critical flows).
- **Performance tests**: k6 (smoke + load).
- **Visual regression**: Playwright screenshots.

Target: **90%+ code coverage** (see `jest.config.js` `coverageThreshold`).

## Commands

| Command | Description |
|--------|-------------|
| `npm test` | Run all Jest tests |
| `npm run test:unit` | Unit tests only |
| `npm run test:integration` | Integration tests only |
| `npm run test:coverage` | Jest with coverage report (enforces 90% threshold) |
| `npm run test:ci` | CI mode: coverage, no watch |
| `npm run test:e2e` | Playwright E2E (all) |
| `npm run test:e2e:visual` | Playwright visual regression only |
| `npm run test:e2e:ui` | Playwright UI mode |
| `npm run test:performance` | k6 smoke test |
| `npm run test:performance:load` | k6 load test |

## Unit tests

- **Location**: `tests/unit/` (and `**/*.test.ts` under `src/`).
- **Fraud**: `FraudDetectionService`, `FraudReviewService`, `transactionFeatureBuilder`.
- **Services**: Billing, Analytics, Authentication, etc.
- **Controllers**: Payment, Analytics, Authentication, etc.

## Integration tests

- **Location**: `tests/integration/`.
- **APIs**: Auth, payment, analytics, fraud, rate limiting.
- **Auth**: Set `API_KEY` (or use default) for `/api/fraud` and other API-key–protected routes.

## E2E (Playwright)

- **Location**: `tests/e2e/`.
- **Flows**: Auth (register, login), payment, dashboard, accessibility.
- **Config**: `playwright.config.ts` (baseURL, webServer, projects).
- **Visual**: `tests/e2e/visual.spec.ts` — update baselines with `npx playwright test --update-snapshots`.

## Performance (k6)

- **Location**: `tests/performance/`.
- **Requires**: [k6](https://k6.io/docs/getting-started/installation/) installed.
- **Smoke**: `k6 run tests/performance/smoke.js`
- **Load**: `k6 run tests/performance/load.js`
- **Env**: `BASE_URL`, `API_KEY` (optional).

## Coverage

- **Report**: `coverage/` (HTML, lcov, text) after `npm run test:coverage`.
- **Threshold**: 90% branches, functions, lines, statements (global). Add tests or adjust threshold in `jest.config.js` if needed.

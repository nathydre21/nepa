# Performance testing with k6

Requires [k6](https://k6.io/docs/getting-started/installation/) to be installed.

- **Smoke**: `k6 run tests/performance/smoke.js` — quick sanity check (2 VUs, 30s).
- **Load**: `k6 run tests/performance/load.js` — sustained load (ramp to 10 VUs, 3 min).

Env:

- `BASE_URL` — API base (default: http://localhost:3000)
- `API_KEY` — API key for protected routes (default: test-api-key)

Or via npm: `npm run test:performance` (runs smoke).

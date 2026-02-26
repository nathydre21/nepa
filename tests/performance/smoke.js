/**
 * k6 smoke test: verify critical API endpoints respond.
 * Run: k6 run tests/performance/smoke.js
 * Requires: k6 installed (https://k6.io/docs/getting-started/installation/)
 */
import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const API_KEY = __ENV.API_KEY || 'test-api-key';

export const options = {
  vus: 2,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate<0.1'],
    http_req_duration: ['p(95)<2000'],
  },
};

export default function () {
  const headers = { 'x-api-key': API_KEY };

  const health = http.get(`${BASE_URL}/health`);
  check(health, { 'health 200': (r) => r.status === 200 });

  const versions = http.get(`${BASE_URL}/api/versions`);
  check(versions, { 'versions 200': (r) => r.status === 200 });

  const fraudStats = http.get(`${BASE_URL}/api/fraud/stats`, { headers });
  check(fraudStats, { 'fraud/stats 200': (r) => r.status === 200 });
}

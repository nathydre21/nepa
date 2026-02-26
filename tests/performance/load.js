/**
 * k6 load test: sustained load on critical endpoints.
 * Run: k6 run tests/performance/load.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const API_KEY = __ENV.API_KEY || 'test-api-key';

export const options = {
  stages: [
    { duration: '1m', target: 10 },
    { duration: '3m', target: 10 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.1'],
    errors: ['rate<0.1'],
  },
};

export default function () {
  const headers = { 'x-api-key': API_KEY };

  const res = http.get(`${BASE_URL}/api/fraud/stats`, { headers });
  const ok = check(res, {
    'fraud stats 200': (r) => r.status === 200,
    'fraud stats < 500ms': (r) => r.timings.duration < 500,
  });
  errorRate.add(!ok);

  sleep(1);
}

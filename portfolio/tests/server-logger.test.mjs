import test from 'node:test';
import assert from 'node:assert/strict';
import { reportServerError } from '../src/lib/server-logger.ts';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const events = [
  'contact.configuration_missing',
  'contact.rate_limiter_unavailable',
  'contact.provider_rejected',
  'contact.provider_response_invalid',
  'contact.delivery_timeout',
  'contact.delivery_failed',
  'cms.public_content_unavailable',
];

function entry(log, index) {
  const call = log.mock.calls[index];
  assert.equal(call.arguments.length, 1, 'Each error has one structured argument.');
  const record = call.arguments[0];
  assert.equal(typeof record, 'object');
  assert.notEqual(record, null);
  assert.equal(Array.isArray(record), false);
  return record;
}

test('each supported event emits exactly one structured error and returns its request ID', t => {
  const log = t.mock.method(console, 'error', () => {});
  const earliest = Date.now();
  for (const [index, event] of events.entries()) {
    const requestId = reportServerError(event);
    assert.equal(log.mock.callCount(), index + 1);
    const record = entry(log, index);
    assert.deepEqual(Object.keys(record).sort(), ['event', 'level', 'requestId', 'timestamp']);
    assert.equal(record.level, 'error');
    assert.equal(record.event, event);
    assert.match(requestId, uuid);
    assert.equal(record.requestId, requestId);
    const timestamp = Date.parse(record.timestamp);
    assert.ok(Number.isFinite(timestamp));
    assert.equal(new Date(timestamp).toISOString(), record.timestamp);
    assert.ok(timestamp >= earliest && timestamp <= Date.now());
  }
});

test('only approved context fields are logged, preserving valid diagnostic metadata', t => {
  const log = t.mock.method(console, 'error', () => {});
  const requestId = '11111111-2222-4333-8444-555555555555';
  const privateValue = 'PRIVATE_EMAIL_KEY_BODY_AND_PROVIDER_DETAILS';
  const result = reportServerError('contact.provider_rejected', {
    requestId,
    providerStatus: 429,
    contentKind: 'articles',
    email: privateValue,
    apiKey: privateValue,
    body: { message: privateValue },
    error: new Error(privateValue),
    headers: { authorization: privateValue },
    level: 'debug',
    event: privateValue,
    timestamp: privateValue,
  });
  assert.equal(log.mock.callCount(), 1);
  const record = entry(log, 0);
  assert.equal(result, requestId);
  assert.deepEqual(record, {
    level: 'error',
    event: 'contact.provider_rejected',
    timestamp: record.timestamp,
    requestId,
    providerStatus: 429,
    contentKind: 'articles',
  });
  assert.ok(!JSON.stringify(record).includes(privateValue));
});

test('forged events, request IDs, status codes, and content kinds are filtered', t => {
  const log = t.mock.method(console, 'error', () => {});
  const invalidStatuses = [99, 600, 502.5, '502', Number.NaN];
  for (const [index, providerStatus] of invalidStatuses.entries()) {
    const result = reportServerError('forged.event\nPRIVATE_DETAIL', {
      requestId: 'forged-request\nPRIVATE_DETAIL',
      providerStatus,
      contentKind: 'untrusted-kind',
    });
    assert.equal(log.mock.callCount(), index + 1);
    const record = entry(log, index);
    assert.equal(record.event, 'server.unexpected_error');
    assert.match(result, uuid);
    assert.equal(record.requestId, result);
    assert.deepEqual(Object.keys(record).sort(), ['event', 'level', 'requestId', 'timestamp']);
    assert.ok(!JSON.stringify(record).includes('PRIVATE_DETAIL'));
  }
});

test('generated request IDs distinguish separate errors', t => {
  const log = t.mock.method(console, 'error', () => {});
  const ids = Array.from({ length: 20 }, () => reportServerError('contact.delivery_failed'));
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(log.mock.callCount(), ids.length);
  for (const [index, requestId] of ids.entries()) {
    assert.match(requestId, uuid);
    assert.equal(entry(log, index).requestId, requestId);
  }
});

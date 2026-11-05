import test, { after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { handleContactRequest } from '../src/lib/contact.ts';

const serverLogs = mock.method(console, 'error', () => {});
after(() => serverLogs.mock.restore());

const endpoint = 'https://silasosunba.com/api/contact';
const config = {
  apiKey: 're_contact_test_secret',
  fromEmail: 'Silas Osunba <contact@mail.silasosunba.com>',
  toEmail: 'owner@example.com',
};
const valid = () => ({ name: 'Ada Lovelace', email: 'ada@example.com', subject: 'Research collaboration', message: 'I would like to discuss a project.' });

function request(payload = valid(), overrides = {}) {
  const { headers, ...options } = overrides;
  return new Request(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: new URL(endpoint).origin, ...headers },
    body: JSON.stringify(payload),
    ...options,
  });
}

function delivery(response = () => Response.json({ id: 'email_test_123' })) {
  const calls = [];
  const send = async (...args) => {
    calls.push(args);
    return response();
  };
  return { send, calls };
}

async function failure(response, status, forbidden = []) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(response.headers.get("x-request-id"), /^[0-9a-f-]{36}$/i);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(typeof body.error, 'string');
  assert.ok(body.error.trim(), 'A useful error message is returned.');
  const output = JSON.stringify(body);
  for (const sensitive of [config.apiKey, ...forbidden]) assert.ok(!output.includes(sensitive), 'Errors must not expose secrets or provider details.');
  return body;
}

test('contact delivery uses server identities, the visitor reply address, and plain text', async () => {
  const { send, calls } = delivery(() => Response.json({ id: 'email_created' }, { status: 201 }));
  const payload = {
    ...valid(),
    name: '  Ada Lovelace  ',
    email: '  ada@example.com  ',
    subject: '  Research collaboration  ',
    message: '  First line.\n<script>This remains text.</script>  ',
    from: 'attacker@example.com',
    to: ['someone-else@example.com'],
    reply_to: 'attacker@example.com',
  };
  const response = await handleContactRequest(request(payload, { headers: { 'Content-Type': 'application/json; charset=utf-8' } }), config, send);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(calls.length, 1);
  const [url, options] = calls[0];
  assert.equal(String(url), 'https://api.resend.com/emails');
  assert.equal(options.method, 'POST');
  const headers = new Headers(options.headers);
  assert.equal(headers.get('authorization'), `Bearer ${config.apiKey}`);
  assert.match(headers.get('content-type'), /^application\/json\b/i);
  const email = JSON.parse(options.body);
  assert.equal(email.from, config.fromEmail);
  assert.deepEqual(email.to, [config.toEmail]);
  assert.equal(email.reply_to, 'ada@example.com');
  assert.equal(email.subject, '[Portfolio] Research collaboration');
  assert.equal(typeof email.text, 'string');
  assert.ok(email.text.includes('Ada Lovelace'));
  assert.ok(email.text.includes('ada@example.com'));
  assert.ok(email.text.includes('First line.\n<script>This remains text.</script>'));
  assert.equal('html' in email, false);
  assert.ok(!JSON.stringify(email).includes('attacker@example.com'));
  assert.ok(!JSON.stringify(email).includes('someone-else@example.com'));
});

test('contact fields reject missing values, wrong types, oversized text, and header injection', async t => {
  const invalid = [
    ['missing name', { name: undefined }],
    ['blank name', { name: '  ' }],
    ['non-text name', { name: { value: 'Ada' } }],
    ['long name', { name: 'n'.repeat(101) }],
    ['missing email', { email: undefined }],
    ['malformed email', { email: 'not-an-email' }],
    ['non-text email', { email: ['ada@example.com'] }],
    ['long email', { email: `${'a'.repeat(243)}@example.com` }],
    ['missing subject', { subject: undefined }],
    ['blank subject', { subject: '\t ' }],
    ['long subject', { subject: 's'.repeat(161) }],
    ['missing message', { message: undefined }],
    ['blank message', { message: ' \n\t ' }],
    ['non-text message', { message: 42 }],
    ['long message', { message: 'm'.repeat(5001) }],
    ['newline in name', { name: 'Ada\nBcc: attacker@example.com' }],
    ['carriage return in email', { email: 'ada@example.com\rBcc: attacker@example.com' }],
    ['newline in subject', { subject: 'Hello\r\nBcc: attacker@example.com' }],
  ];
  for (const [label, patch] of invalid) await t.test(label, async () => {
    const { send, calls } = delivery();
    await failure(await handleContactRequest(request({ ...valid(), ...patch }), config, send), 400);
    assert.equal(calls.length, 0);
  });
});

test('text fields accept their documented maximum lengths', async () => {
  const { send, calls } = delivery();
  const response = await handleContactRequest(request({ ...valid(), name: 'n'.repeat(100), subject: 's'.repeat(160), message: 'm'.repeat(5000) }), config, send);
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
});

test('legacy autofilled website values do not block valid contact submissions', async t => {
  for (const website of ['autofilled@example.com', null]) await t.test(String(website), async () => {
    const { send, calls } = delivery();
    const response = await handleContactRequest(request({ ...valid(), website }), config, send);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(calls.length, 1);
    const email = JSON.parse(calls[0][1].body);
    assert.equal('website' in email, false);
    assert.equal(calls[0][1].body.includes('autofilled@example.com'), false);
    assert.equal(email.reply_to, valid().email);
    assert.deepEqual(email.to, [config.toEmail]);
  });
});

test('only requests with the matching Origin can send contact email', async t => {
  for (const origin of [undefined, 'null', 'https://evil.example', 'https://silasosunba.com.evil.example', 'http://silasosunba.com', 'https://silasosunba.com:444']) {
    await t.test(String(origin), async () => {
      const incoming = request();
      if (origin === undefined) incoming.headers.delete('origin');
      else incoming.headers.set('origin', origin);
      incoming.headers.set('referer', 'https://silasosunba.com/contact');
      const { send, calls } = delivery();
      await failure(await handleContactRequest(incoming, config, send), 403);
      assert.equal(calls.length, 0);
    });
  }
});

test('unsupported content types, malformed JSON, and non-object payloads do not send', async t => {
  for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data']) await t.test(type, async () => {
    const { send, calls } = delivery();
    await failure(await handleContactRequest(request(valid(), { headers: { 'Content-Type': type } }), config, send), 415);
    assert.equal(calls.length, 0);
  });
  for (const body of ['{', 'null', '[]', '"a string"']) await t.test(`JSON ${body}`, async () => {
    const { send, calls } = delivery();
    await failure(await handleContactRequest(request(valid(), { body }), config, send), 400);
    assert.equal(calls.length, 0);
  });
});

test('body size is bounded for both declared lengths and streamed requests without Content-Length', async t => {
  await t.test('declared oversized body', async () => {
    const { send, calls } = delivery();
    await failure(await handleContactRequest(request(valid(), { headers: { 'Content-Length': String(32 * 1024 + 1) } }), config, send), 413);
    assert.equal(calls.length, 0);
  });
  await t.test('streamed oversized body', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ ...valid(), padding: 'x'.repeat(32 * 1024) }));
    const body = new ReadableStream({
      start(controller) {
        for (let offset = 0; offset < bytes.length; offset += 1024) controller.enqueue(bytes.slice(offset, offset + 1024));
        controller.close();
      },
    });
    const incoming = request(valid(), { body, duplex: 'half' });
    assert.equal(incoming.headers.has('content-length'), false);
    const { send, calls } = delivery();
    await failure(await handleContactRequest(incoming, config, send), 413);
    assert.equal(calls.length, 0);
  });
});

test('each required server setting must be present before delivery', async t => {
  for (const field of ['apiKey', 'fromEmail', 'toEmail']) await t.test(field, async () => {
    const { send, calls } = delivery();
    await failure(await handleContactRequest(request(), { ...config, [field]: undefined }, send), 503);
    assert.equal(calls.length, 0);
  });
});

test('provider rejection and malformed success responses return safe delivery errors', async t => {
  const privateDetail = 'Provider diagnostic contains a private account identifier.';
  const responses = [
    ['rejected', () => Response.json({ message: privateDetail, apiKey: config.apiKey }, { status: 422 })],
    ['upstream unavailable', () => new Response(privateDetail, { status: 503 })],
    ['invalid JSON', () => new Response(privateDetail, { status: 200 })],
    ['missing delivery id', () => Response.json({ message: privateDetail })],
    ['empty delivery id', () => Response.json({ id: '' })],
    ['wrong delivery id type', () => Response.json({ id: 123 })],
    ['empty success response', () => new Response(null, { status: 204 })],
  ];
  for (const [label, response] of responses) await t.test(label, async () => {
    const { send, calls } = delivery(response);
    await failure(await handleContactRequest(request(), config, send), 502, [privateDetail]);
    assert.equal(calls.length, 1);
  });
});

test('network errors and timeouts hide their internal messages', async t => {
  const privateDetail = `Provider connection failed with ${config.apiKey}`;
  for (const [label, error, status] of [
    ['network error', new Error(privateDetail), 502],
    ['timeout', new DOMException(privateDetail, 'TimeoutError'), 504],
  ]) await t.test(label, async () => {
    let calls = 0;
    const send = async () => { calls += 1; throw error; };
    await failure(await handleContactRequest(request(), config, send), status, [privateDetail]);
    assert.equal(calls, 1);
  });
});

test('rate limiting rejects excess requests and uses the Cloudflare client address', async () => {
  const { send, calls } = delivery();
  const keys = [];
  const rateLimiter = { limit: async ({ key }) => { keys.push(key); return { success: false }; } };
  const response = await handleContactRequest(request(valid(), { headers: { 'CF-Connecting-IP': '203.0.113.42' } }), config, send, rateLimiter);
  await failure(response, 429);
  assert.equal(response.headers.get('retry-after'), '60');
  assert.equal(keys.length, 1);
  assert.equal(typeof keys[0], 'string');
  assert.ok(keys[0].includes('203.0.113.42'));
  assert.equal(calls.length, 0);
});

test('an allowed rate limit result delivers normally, including local requests without an IP header', async () => {
  const { send, calls } = delivery();
  let key;
  const rateLimiter = { limit: async input => { key = input.key; return { success: true }; } };
  const response = await handleContactRequest(request(), config, send, rateLimiter);
  assert.equal(response.status, 200);
  assert.equal(typeof key, 'string');
  assert.ok(key.length > 0);
  assert.equal(calls.length, 1);
});


test('local Workers preview accepts loopback aliases but rejects different ports or public hosts', async t => {
  for (const [url, origin, expected] of [
    ['http://localhost:8787/api/contact', 'http://127.0.0.1:8787', 200],
    ['https://localhost:8787/api/contact', 'http://localhost:8787', 200],
    ['http://localhost:8787/api/contact', 'http://127.0.0.1:8788', 403],
    ['http://localhost:8787/api/contact', 'http://localhost.evil.example:8787', 403],
    ['https://silasosunba.com/api/contact', 'http://127.0.0.1', 403],
  ]) await t.test(`${origin} to ${url}`, async () => {
    const incoming = new Request(url, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(valid()) });
    const { send, calls } = delivery();
    const response = await handleContactRequest(incoming, config, send);
    assert.equal(response.status, expected);
    assert.equal(calls.length, expected === 200 ? 1 : 0);
  });
});

test('a failed rate limiter does not bypass abuse protection or send mail', async () => {
  const { send, calls } = delivery();
  const rateLimiter = { limit: async () => { throw new Error('Private diagnostic'); } };
  await failure(await handleContactRequest(request(), config, send, rateLimiter), 503, ['Private diagnostic']);
  assert.equal(calls.length, 0);
});


test('contact failures correlate a safe structured server event with the response request ID', async () => {
  const { send } = delivery(() => Response.json({ message: 'PRIVATE_PROVIDER_DETAIL' }, { status: 401 }));
  const incoming = request();
  incoming.headers.set('x-request-id', 'UNTRUSTED_CLIENT_IDENTIFIER');
  const before = serverLogs.mock.callCount();
  const response = await handleContactRequest(incoming, config, send);
  assert.equal(response.status, 502);
  assert.equal(serverLogs.mock.callCount(), before + 1);
  const record = serverLogs.mock.calls[before].arguments[0];
  assert.equal(record.event, 'contact.provider_rejected');
  assert.equal(record.providerStatus, 401);
  assert.equal(record.requestId, response.headers.get('x-request-id'));
  const logged = JSON.stringify(record);
  for (const value of [config.apiKey, 'PRIVATE_PROVIDER_DETAIL', 'UNTRUSTED_CLIENT_IDENTIFIER', valid().email, valid().message]) {
    assert.equal(logged.includes(value), false);
  }
});

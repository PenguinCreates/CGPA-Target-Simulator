import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import {
  initializePaystack,
  isCorrectPayment,
  verifyWebhookSignature,
} from '../../../lib/paystack-server.mjs';

const originalSecret = process.env.PAYSTACK_SECRET_KEY;

test('accepts only the correct one-time GHS 30 payment for the signed-in user', () => {
  const user = { id: 'auth-user-1', email: 'student@example.com' };
  const valid = {
    status: 'success',
    amount: 3000,
    currency: 'GHS',
    customer: { email: 'student@example.com' },
    metadata: { user_id: 'auth-user-1' },
    reference: 'paystack-ref',
  };

  assert.equal(isCorrectPayment(valid, user), true);
  assert.equal(isCorrectPayment({ ...valid, amount: 2999 }, user), false);
  assert.equal(isCorrectPayment({ ...valid, currency: 'USD' }, user), false);
  assert.equal(isCorrectPayment({ ...valid, metadata: { user_id: 'another-user' } }, user), false);
  assert.equal(isCorrectPayment({ ...valid, customer: { email: 'another@example.com' } }, user), false);
});

test('validates Paystack webhook signatures against the raw request body', () => {
  process.env.PAYSTACK_SECRET_KEY = 'unit-test-secret';
  const body = Buffer.from('{"event":"charge.success"}');
  const signature = createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(body).digest('hex');
  assert.equal(verifyWebhookSignature(body, signature), true);
  assert.equal(verifyWebhookSignature(body, '0'.repeat(128)), false);
  process.env.PAYSTACK_SECRET_KEY = originalSecret;
});

test('initializes checkout with the fixed GHS 30 price and account identity', async () => {
  const oldFetch = globalThis.fetch;
  const oldEnv = {
    PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    APP_URL: process.env.APP_URL,
  };
  process.env.PAYSTACK_SECRET_KEY = 'unit-test-secret';
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'unit-test-anon';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'unit-test-service';
  process.env.APP_URL = 'https://studyline.example';
  let received;
  globalThis.fetch = async (url, init) => {
    received = { url, init, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({
      status: true,
      data: { authorization_url: 'https://checkout.paystack.com/test', reference: 'test-ref' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const checkout = await initializePaystack({
      user: { id: 'auth-user-1', email: 'student@example.com' },
    });
    assert.equal(received.url, 'https://api.paystack.co/transaction/initialize');
    assert.equal(received.body.amount, 3000);
    assert.equal(received.body.currency, 'GHS');
    assert.equal(received.body.email, 'student@example.com');
    assert.equal(received.body.metadata.user_id, 'auth-user-1');
    assert.equal(received.body.callback_url, 'https://studyline.example/');
    assert.equal(checkout.reference, 'test-ref');
  } finally {
    globalThis.fetch = oldFetch;
    for (const [key, value] of Object.entries(oldEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

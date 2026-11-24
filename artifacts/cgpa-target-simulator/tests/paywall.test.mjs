import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import {
  initializePaystack,
  getAccessStatus,
  isCorrectPayment,
  getPlanExpiry,
  recordVerifiedPayment,
  verifyWebhookSignature,
} from '../../../lib/paystack-server.mjs';

const originalSecret = process.env.PAYSTACK_SECRET_KEY;

test('accepts only the selected one-time plan at its exact price for the signed-in user', () => {
  const user = { id: 'auth-user-1', email: 'student@example.com' };
  const valid = {
    status: 'success',
    amount: 19900,
    currency: 'GHS',
    customer: { email: 'student@example.com' },
    metadata: { user_id: 'auth-user-1', plan_id: 'lifetime' },
    reference: 'paystack-ref',
  };

  assert.equal(isCorrectPayment(valid, user), true);
  assert.equal(isCorrectPayment({ ...valid, amount: 19999 }, user), false);
  assert.equal(isCorrectPayment({ ...valid, metadata: { user_id: 'auth-user-1', plan_id: 'six_months' } }, user), false);
  assert.equal(isCorrectPayment({
    ...valid,
    amount: 3000,
    metadata: { user_id: 'auth-user-1', plan_id: 'six_months' },
  }, user), true);
  assert.equal(isCorrectPayment({
    ...valid,
    amount: 5500,
    metadata: { user_id: 'auth-user-1', plan_id: 'twelve_months' },
  }, user), true);
  assert.equal(isCorrectPayment({ ...valid, currency: 'USD' }, user), false);
  assert.equal(isCorrectPayment({ ...valid, metadata: { user_id: 'another-user' } }, user), false);
  assert.equal(isCorrectPayment({ ...valid, customer: { email: 'another@example.com' } }, user), false);
});

test('calculates fixed-term expiry by calendar month and keeps lifetime unexpired', () => {
  assert.equal(getPlanExpiry('six_months', new Date('2026-01-31T12:00:00.000Z')), '2026-07-31T12:00:00.000Z');
  assert.equal(getPlanExpiry('twelve_months', new Date('2024-02-29T12:00:00.000Z')), '2025-02-28T12:00:00.000Z');
  assert.equal(getPlanExpiry('lifetime', new Date('2026-01-31T12:00:00.000Z')), null);
});

test('expires term access while preserving unexpired lifetime access', async () => {
  const oldFetch = globalThis.fetch;
  const oldEnv = {
    PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  process.env.PAYSTACK_SECRET_KEY = 'unit-test-secret';
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'unit-test-anon';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'unit-test-service';
  let entitlement;
  globalThis.fetch = async () => new Response(JSON.stringify([entitlement]), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
  try {
    entitlement = { active: true, plan_id: 'six_months', expires_at: '2020-01-01T00:00:00.000Z' };
    assert.equal((await getAccessStatus('auth-user-1')).access, false);
    entitlement = { active: true, plan_id: 'lifetime', expires_at: null };
    assert.equal((await getAccessStatus('auth-user-1')).access, true);
  } finally {
    globalThis.fetch = oldFetch;
    for (const [key, value] of Object.entries(oldEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('does not extend term access when the same Paystack reference is replayed', async () => {
  const oldFetch = globalThis.fetch;
  const oldEnv = {
    PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  process.env.PAYSTACK_SECRET_KEY = 'unit-test-secret';
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'unit-test-anon';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'unit-test-service';
  const calls = [];
  let existingPayment = false;
  let savedExpiry = null;
  globalThis.fetch = async (url, init = {}) => {
    const method = init.method || 'GET';
    calls.push({ url: String(url), method, body: init.body ? JSON.parse(init.body) : null });
    if (String(url).includes('/studyline_payments?reference=')) {
      return new Response(JSON.stringify(existingPayment ? [{ user_id: 'auth-user-1', plan_id: 'six_months' }] : []), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (method === 'POST' && String(url).includes('/studyline_payments?')) {
      existingPayment = true;
      return new Response(null, { status: 201 });
    }
    if (method === 'POST' && String(url).includes('/studyline_entitlements?')) {
      savedExpiry = JSON.parse(init.body).expires_at;
      return new Response(null, { status: 201 });
    }
    if (String(url).includes('/studyline_entitlements?')) {
      return new Response(JSON.stringify([{
        active: true,
        plan_id: 'six_months',
        expires_at: savedExpiry,
      }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error(`Unexpected request ${method} ${url}`);
  };
  try {
    const first = await recordVerifiedPayment({
      userId: 'auth-user-1',
      email: 'student@example.com',
      reference: 'one-reference',
      planId: 'six_months',
    });
    const postCount = calls.filter((call) => call.method === 'POST').length;
    const replay = await recordVerifiedPayment({
      userId: 'auth-user-1',
      email: 'student@example.com',
      reference: 'one-reference',
      planId: 'six_months',
    });
    assert.equal(first.expiresAt, replay.expiresAt);
    assert.equal(calls.filter((call) => call.method === 'POST').length, postCount);
  } finally {
    globalThis.fetch = oldFetch;
    for (const [key, value] of Object.entries(oldEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('validates Paystack webhook signatures against the raw request body', () => {
  process.env.PAYSTACK_SECRET_KEY = 'unit-test-secret';
  const body = Buffer.from('{"event":"charge.success"}');
  const signature = createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(body).digest('hex');
  assert.equal(verifyWebhookSignature(body, signature), true);
  assert.equal(verifyWebhookSignature(body, '0'.repeat(128)), false);
  process.env.PAYSTACK_SECRET_KEY = originalSecret;
});

test('production checkout returns to the Studyline simulator after payment', async () => {
  const oldFetch = globalThis.fetch;
  const oldEnv = {
    PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    APP_URL: process.env.APP_URL,
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_URL: process.env.VERCEL_URL,
  };
  process.env.PAYSTACK_SECRET_KEY = 'unit-test-secret';
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'unit-test-anon';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'unit-test-service';
  process.env.APP_URL = 'https://studyline.example';
  process.env.VERCEL_ENV = 'production';
  process.env.VERCEL_URL = 'preview-deployment.vercel.app';
  let received;
  globalThis.fetch = async (url, init) => {
    received = { url, init, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({
      status: true,
      data: { authorization_url: 'https://checkout.paystack.com/test', reference: 'test-ref' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    for (const [planId, amount] of [['six_months', 3000], ['twelve_months', 5500], ['lifetime', 19900]]) {
      const checkout = await initializePaystack({
        user: { id: 'auth-user-1', email: 'student@example.com' },
        planId,
      });
      assert.equal(received.url, 'https://api.paystack.co/transaction/initialize');
      assert.equal(received.body.amount, amount);
      assert.equal(received.body.currency, 'GHS');
      assert.equal(received.body.email, 'student@example.com');
      assert.equal(received.body.metadata.user_id, 'auth-user-1');
      assert.equal(received.body.metadata.plan_id, planId);
      assert.equal(received.body.callback_url, 'https://studyline-cgpa-target-simulator.vercel.app/');
      assert.equal(checkout.reference, 'test-ref');
    }
  } finally {
    globalThis.fetch = oldFetch;
    for (const [key, value] of Object.entries(oldEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('returns preview checkout to the current Vercel preview deployment', async () => {
  const oldFetch = globalThis.fetch;
  const oldEnv = {
    PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    APP_URL: process.env.APP_URL,
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_URL: process.env.VERCEL_URL,
  };
  process.env.PAYSTACK_SECRET_KEY = 'unit-test-secret';
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'unit-test-anon';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'unit-test-service';
  process.env.APP_URL = 'https://studyline.example';
  process.env.VERCEL_ENV = 'preview';
  process.env.VERCEL_URL = 'studyline-preview-abc.vercel.app';
  let received;
  globalThis.fetch = async (_url, init) => {
    received = JSON.parse(init.body);
    return new Response(JSON.stringify({
      status: true,
      data: { authorization_url: 'https://checkout.paystack.com/test', reference: 'test-ref' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    await initializePaystack({
      user: { id: 'auth-user-1', email: 'student@example.com' },
      planId: 'lifetime',
    });
    assert.equal(received.amount, 19900);
    assert.equal(received.callback_url, 'https://studyline-preview-abc.vercel.app/');
  } finally {
    globalThis.fetch = oldFetch;
    for (const [key, value] of Object.entries(oldEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

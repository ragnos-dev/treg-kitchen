import assert from 'node:assert/strict';
import test from 'node:test';
import { BlobPreconditionFailedError } from '@vercel/blob';
import { dailyBudget, lifetimeBudget, recipeReservation, reserveRecipe } from '../lib/budget.js';

const day = 20000;
const env = { KITCHEN_BUDGET_STORE: 'blob', BLOB_READ_WRITE_TOKEN: 'scoped-test-token' };
const initial = { version: 1, day, spent: 0, lifetimeSpent: 0 };

function fixture(seed = initial) {
  let state = seed && { ...seed };
  let revision = 1;
  const writes = [];
  const blobClient = {
    async get(path, options) {
      assert.equal(path, 'treg-kitchen/production-budget.json');
      assert.equal(options.access, 'private');
      assert.equal(options.useCache, false);
      assert.equal(options.token, env.BLOB_READ_WRITE_TOKEN);
      if (!state) return null;
      return { statusCode: 200, blob: { etag: `"${revision}"` }, stream: Response.json(state).body };
    },
    async put(path, body, options) {
      assert.equal(path, 'treg-kitchen/production-budget.json');
      assert.equal(options.access, 'private');
      assert.equal(options.token, env.BLOB_READ_WRITE_TOKEN);
      assert.equal(options.allowOverwrite, true);
      assert.equal(options.addRandomSuffix, false);
      if (options.ifMatch !== `"${revision}"`) throw new BlobPreconditionFailedError();
      state = JSON.parse(body);
      writes.push(state);
      revision++;
    },
  };
  return { blobClient, writes, state: () => state, reserve: () => reserveRecipe({ env, blobClient, now: () => day * 86400000 }) };
}

test('private Blob reserves both ceilings atomically under contention', async () => {
  const f = fixture({ ...initial, lifetimeSpent: lifetimeBudget - recipeReservation * 3 });
  const results = await Promise.allSettled(Array.from({ length: 12 }, () => f.reserve()));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 3);
  assert.ok(results.filter((r) => r.status === 'rejected').every((r) => r.reason.status === 429));
  assert.equal(f.state().lifetimeSpent, lifetimeBudget);
  assert.equal(f.state().spent, recipeReservation * 3);
});

test('day rollover clears only daily spend and never replenishes lifetime funds', async () => {
  const f = fixture({ ...initial, day: day - 1, spent: dailyBudget, lifetimeSpent: lifetimeBudget - recipeReservation });
  await f.reserve();
  assert.equal(f.state().spent, recipeReservation);
  assert.equal(f.state().lifetimeSpent, lifetimeBudget);
  await assert.rejects(f.reserve(), { status: 429 });
});

test('daily ceiling rejects without overwriting the ledger', async () => {
  const f = fixture({ ...initial, spent: dailyBudget - 1, lifetimeSpent: dailyBudget });
  await assert.rejects(f.reserve(), { status: 429 });
  assert.equal(f.writes.length, 0);
});

test('missing or corrupt private ledgers fail closed without creating or resetting', async () => {
  for (const seed of [null, {}, { ...initial, version: 2 }, { ...initial, lifetimeSpent: -1 },
    { ...initial, lifetimeSpent: lifetimeBudget + 1 }, { ...initial, spent: 1 },
    { ...initial, day: day + 1 }, { ...initial, lifetimeSpent: 0.5 }]) {
    const f = fixture(seed);
    await assert.rejects(f.reserve(), { status: 503 });
    assert.equal(f.writes.length, 0);
  }
});

test('uncertain private write is never retried or dispatched as successful', async () => {
  const f = fixture();
  let calls = 0;
  const put = f.blobClient.put;
  f.blobClient.put = async (...args) => { calls++; await put(...args); throw new Error('connection lost after commit'); };
  await assert.rejects(f.reserve(), { status: 503 });
  assert.equal(calls, 1);
  assert.equal(f.state().lifetimeSpent, recipeReservation);
});

test('repeated definite CAS conflicts are bounded and fail closed', async () => {
  const f = fixture();
  let calls = 0;
  f.blobClient.put = async () => { calls++; throw new BlobPreconditionFailedError(); };
  await assert.rejects(f.reserve(), { status: 503 });
  assert.equal(calls, 8);
});

test('explicit store selection never falls back or uses OIDC without a store token', async () => {
  for (const options of [{ KITCHEN_BUDGET_STORE: 'unknown' }, { KITCHEN_BUDGET_STORE: 'blob', VERCEL_OIDC_TOKEN: 'oidc' }]) {
    await assert.rejects(reserveRecipe({ env: options, fetcher: () => assert.fail(), blobClient: { get: () => assert.fail() } }), { status: 503 });
  }
});

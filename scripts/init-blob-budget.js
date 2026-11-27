import { get, put } from '@vercel/blob';

// Run once when setting up a new dedicated store, before enabling generation.
const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) throw new Error('A project Blob store token is required.');
const pathname = process.env.KITCHEN_BLOB_BUDGET_PATH || 'treg-kitchen/production-budget.json';
const options = { access: 'private', token };
if (!await get(pathname, { ...options, useCache: false })) {
  const state = { version: 1, day: Math.floor(Date.now() / 86_400_000), spent: 0, lifetimeSpent: 0 };
  await put(pathname, JSON.stringify(state), {
    ...options, allowOverwrite: false, addRandomSuffix: false, contentType: 'application/json',
  });
}
const stored = await get(pathname, { ...options, useCache: false });
if (!stored?.stream) throw new Error('The budget ledger could not be read.');
const { version, spent, lifetimeSpent } = await new Response(stored.stream).json();
console.log('Budget ledger (micro USD)', { version, spent, lifetimeSpent });

import { get, put, BlobPreconditionFailedError } from '@vercel/blob';

export const dailyBudget = 1_000_000;
export const lifetimeBudget = 10_000_000;
export const recipeReservation = 27_000;

export function unavailable(message = 'Live generation is paused. You can edit the example or copy the skill.') {
  return Object.assign(new Error(message), { status: 503, code: 'generation_paused' });
}

const reserveScript = `
local now = tonumber(redis.call('TIME')[1])
local today = math.floor(now / 86400)
local function integer(value)
  return value and value >= 0 and value == math.floor(value)
end
if redis.call('HGET', KEYS[1], 'version') ~= '1' or redis.call('TTL', KEYS[1]) ~= -1 then return -1 end
local previous = tonumber(redis.call('HGET', KEYS[1], 'day'))
local spent = tonumber(redis.call('HGET', KEYS[1], 'spent'))
local lifetime = tonumber(redis.call('HGET', KEYS[1], 'lifetimeSpent'))
if not integer(previous) or previous > today or not integer(spent) or not integer(lifetime) or spent > lifetime or spent > tonumber(ARGV[2]) or lifetime > tonumber(ARGV[3]) then return -1 end
if previous ~= today then spent = 0 end
local amount = tonumber(ARGV[1])
if lifetime + amount > tonumber(ARGV[3]) then return 2 end
if spent + amount > tonumber(ARGV[2]) then return 0 end
redis.call('HSET', KEYS[1], 'day', today, 'spent', spent + amount, 'lifetimeSpent', lifetime + amount)
return 1
`;

function limit(lifetime = false) {
  return Object.assign(new Error(lifetime
    ? 'The total generation limit is reached. You can edit the example or copy the skill.'
    : 'Today’s generation limit is reached. You can edit the example or copy the skill.'), { status: 429, code: 'generation_limit' });
}

async function reserveBlob(env, blobClient, now) {
  // Explicit private-store token only. Never fall back to broader OIDC credentials.
  if (!env.BLOB_READ_WRITE_TOKEN) throw unavailable();
  const pathname = env.KITCHEN_BLOB_BUDGET_PATH || 'treg-kitchen/production-budget.json';
  const token = env.BLOB_READ_WRITE_TOKEN;
  const abortSignal = AbortSignal.timeout(4000);
  for (let attempt = 0; attempt < 8; attempt++) {
    const current = await blobClient.get(pathname, { access: 'private', token, useCache: false, abortSignal });
    if (!current || current.statusCode !== 200 || !current.stream || !current.blob?.etag) throw unavailable();
    const state = await new Response(current.stream).json();
    const today = Math.floor(now() / 86400000);
    if (state.version !== 1 || ![state.day, state.spent, state.lifetimeSpent].every((v) => Number.isSafeInteger(v) && v >= 0)
      || state.day > today || state.spent > state.lifetimeSpent || state.spent > dailyBudget || state.lifetimeSpent > lifetimeBudget) throw unavailable();
    const spent = state.day === today ? state.spent : 0;
    if (state.lifetimeSpent + recipeReservation > lifetimeBudget) throw limit(true);
    if (spent + recipeReservation > dailyBudget) throw limit();
    try {
      await blobClient.put(pathname, JSON.stringify({ version: 1, day: today, spent: spent + recipeReservation, lifetimeSpent: state.lifetimeSpent + recipeReservation }), {
        access: 'private', token, addRandomSuffix: false, allowOverwrite: true,
        contentType: 'application/json', ifMatch: current.blob.etag, abortSignal,
      });
      return;
    } catch (error) {
      // Retry only a definite CAS conflict; an uncertain write keeps its reservation.
      if (!(error instanceof BlobPreconditionFailedError)) throw error;
    }
  }
  throw unavailable();
}

export async function reserveRecipe({ env = process.env, fetcher = fetch, blobClient = { get, put }, now = Date.now } = {}) {
  try {
    if (env.KITCHEN_BUDGET_STORE === 'blob') return await reserveBlob(env, blobClient, now);
    if (env.KITCHEN_BUDGET_STORE && env.KITCHEN_BUDGET_STORE !== 'redis') throw unavailable();
    const url = env.KITCHEN_REDIS_URL || env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
    const token = env.KITCHEN_REDIS_TOKEN || env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
    if (!url || !token) throw unavailable();
    const response = await fetcher(url, {
      method: 'POST',
      redirect: 'error',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['EVAL', reserveScript, 1, 'treg-kitchen:production:daily', recipeReservation, dailyBudget, lifetimeBudget]),
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) throw unavailable();
    const { result } = await response.json();
    if (result === 1) return;
    if (result === 0 || result === 2) throw limit(result === 2);
    throw unavailable();
  } catch (error) {
    if (error.status === 429) throw error;
    throw unavailable();
  }
}

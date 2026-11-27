export const dailyBudget = 1_000_000;
export const recipeReservation = 27_000;

export function unavailable(message = 'Live generation is paused. You can edit the example or copy the skill.') {
  return Object.assign(new Error(message), { status: 503, code: 'generation_paused' });
}

const reserveScript = `
local now = tonumber(redis.call('TIME')[1])
local today = math.floor(now / 86400)
local previous = tonumber(redis.call('HGET', KEYS[1], 'day'))
local spent = 0
if previous == today then spent = tonumber(redis.call('HGET', KEYS[1], 'spent')) or 0 end
local amount = tonumber(ARGV[1])
if spent + amount > tonumber(ARGV[2]) then return 0 end
redis.call('HSET', KEYS[1], 'day', today, 'spent', spent + amount)
redis.call('EXPIRE', KEYS[1], 172800)
return 1
`;

export async function reserveRecipe({ env = process.env, fetcher = fetch } = {}) {
  const url = env.KITCHEN_REDIS_URL || env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.KITCHEN_REDIS_TOKEN || env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  if (!url || !token) throw unavailable();
  try {
    const response = await fetcher(url, {
      method: 'POST',
      redirect: 'error',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['EVAL', reserveScript, 1, 'treg-kitchen:production:daily', recipeReservation, dailyBudget]),
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) throw unavailable();
    const { result } = await response.json();
    if (result === 1) return;
    if (result === 0) {
      throw Object.assign(new Error('Today’s generation limit is reached. You can edit the example or copy the skill.'), { status: 429, code: 'generation_limit' });
    }
    throw unavailable();
  } catch (error) {
    if (error.status === 429) throw error;
    throw unavailable();
  }
}

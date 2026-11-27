import assert from 'node:assert/strict';
import { execFile, spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { promisify } from 'node:util';
import test from 'node:test';
import { dailyBudget, recipeReservation, reserveRecipe } from '../lib/budget.js';
import { withGenerationBudget } from '../lib/gateway.js';

const env = {
  KITCHEN_FREE_CREDITS_VERIFIED: '1',
  VERCEL_OIDC_TOKEN: 'test-oidc',
  KITCHEN_REDIS_URL: 'https://redis.example.com',
  KITCHEN_REDIS_TOKEN: 'test-redis',
};
const messages = [{ role: 'user', content: 'Return a JSON object.' }];
const modelRates = Response.json({
  data: [{ id: 'google/gemini-3.1-flash-lite', pricing: { input: '0.00000025', output: '0.0000015' } }],
});

test('generation requires explicit free-credit verification', async () => {
  await assert.rejects(withGenerationBudget(() => assert.fail('unexpected generation'), {
    env: { ...env, KITCHEN_FREE_CREDITS_VERIFIED: '0' },
    fetcher: () => assert.fail('unexpected network access'),
  }), { status: 503 });
});

test('reservation runs before any completion and bounds the number of model passes', async () => {
  const requests = [];
  const fetcher = (url, options) => {
    requests.push(new URL(url).pathname);
    if (url.endsWith('/models')) return modelRates.clone();
    if (url === env.KITCHEN_REDIS_URL) return Response.json({ result: 1 });
    const body = JSON.parse(options.body);
    assert.equal(body.max_completion_tokens, 120);
    assert.deepEqual(body.providerOptions.gateway.only, ['google']);
    return Response.json({ choices: [{ message: { content: '{"draft":true}' } }] });
  };
  await withGenerationBudget(async (complete) => {
    assert.deepEqual(await complete(messages, 120), { draft: true });
    assert.deepEqual(await complete(messages, 120), { draft: true });
    await assert.rejects(complete(messages, 120), { status: 422 });
  }, { env, fetcher });
  assert.deepEqual(requests, ['/v1/models', '/', '/v1/chat/completions', '/v1/chat/completions']);
});

test('running out of the daily budget never dispatches a model call', async () => {
  await assert.rejects(withGenerationBudget(() => assert.fail('unexpected generation'), {
    env,
    fetcher: (url) => url.endsWith('/models') ? modelRates.clone() : Response.json({ result: 0 }),
  }), { status: 429 });
});

const hasRedis = ['redis-server', 'redis-cli'].every(
  (command) => spawnSync(command, ['--version']).status === 0,
);

test('Redis admits concurrent reservations only up to the shared daily ceiling', { skip: !hasRedis }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'treg-kitchen-redis-'));
  const socket = join(dir, 'r');
  const server = spawn('redis-server', ['--port', '0', '--unixsocket', socket, '--save', '', '--appendonly', 'no'], {
    stdio: 'ignore',
  });
  const redis = async (...args) => (await promisify(execFile)('redis-cli', ['-s', socket, '--raw', ...args])).stdout.trim();

  try {
    for (let attempt = 0; ; attempt++) {
      try { assert.equal(await redis('PING'), 'PONG'); break; }
      catch (error) { if (attempt === 30) throw error; await setTimeout(35); }
    }
    const fetcher = async (_url, options) => {
      const command = JSON.parse(options.body).map(String);
      return Response.json({ result: Number(await redis(...command)) });
    };
    const today = Math.floor(Date.now() / 86_400_000);
    await redis('HSET', 'treg-kitchen:production:daily', 'version', '1', 'day', String(today), 'spent', '0', 'lifetimeSpent', '0');
    const admitted = Math.floor(dailyBudget / recipeReservation);
    const results = await Promise.allSettled(Array.from({ length: admitted + 7 }, () => reserveRecipe({ env, fetcher })));
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, admitted);
    assert.equal(Number(await redis('HGET', 'treg-kitchen:production:daily', 'spent')), admitted * recipeReservation);
    assert.ok(results.filter((result) => result.status === 'rejected').every((result) => result.reason.status === 429));
  } finally {
    const stopped = new Promise((resolve) => server.once('exit', resolve));
    server.kill();
    await stopped;
    await rm(dir, { recursive: true, force: true });
  }
});


test('direct OpenAI uses only the scoped project and reserves before dispatch', async () => {
  const scoped = { ...env, KITCHEN_MODEL_PROVIDER: 'openai', KITCHEN_OPENAI_ORG_ID: 'test-org',
    KITCHEN_OPENAI_PROJECT_ID: 'test-project', KITCHEN_OPENAI_API_KEY: 'test-api-key' };
  for (const key of ['KITCHEN_OPENAI_API_KEY', 'KITCHEN_OPENAI_ORG_ID', 'KITCHEN_OPENAI_PROJECT_ID']) {
    await assert.rejects(withGenerationBudget(() => assert.fail(), { env: { ...scoped, [key]: '' },
      fetcher: () => assert.fail('must fail before networking') }), { status: 503 });
  }
  const calls = [];
  const fetcher = (url, options) => {
    calls.push(url);
    if (url === env.KITCHEN_REDIS_URL) return Response.json({ result: 1 });
    assert.equal(options.headers.Authorization, 'Bearer test-api-key');
    assert.equal(options.headers['OpenAI-Project'], 'test-project');
    assert.equal(options.headers['OpenAI-Organization'], 'test-org');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'gpt-4.1-nano-2025-04-14');
    assert.equal(body.service_tier, 'default');
    assert.equal(body.providerOptions, undefined);
    return Response.json({ choices: [{ message: { content: '{"ok":true}' } }] });
  };
  assert.deepEqual(await withGenerationBudget(complete => complete(messages, 150), { env: scoped, fetcher }), { ok: true });
  assert.deepEqual(calls, [env.KITCHEN_REDIS_URL, 'https://api.openai.com/v1/chat/completions']);
});

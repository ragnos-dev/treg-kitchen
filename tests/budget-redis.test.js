import assert from 'node:assert/strict';
import { execFile, spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { promisify } from 'node:util';
import test from 'node:test';
import { dailyBudget, lifetimeBudget, recipeReservation, reserveRecipe } from '../lib/budget.js';

const available = ['redis-server', 'redis-cli'].every((command) => spawnSync(command, ['--version']).status === 0);
test('Redis lifetime state is persistent, mandatory, atomic and retained across day rollover', { skip: !available }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'treg-kitchen-budget-'));
  const socket = join(dir, 'r');
  const server = spawn('redis-server', ['--port', '0', '--unixsocket', socket, '--save', '', '--appendonly', 'no'], { stdio: 'ignore' });
  const redis = async (...args) => (await promisify(execFile)('redis-cli', ['-s', socket, '--raw', ...args.map(String)])).stdout.trim();
  const env = { KITCHEN_REDIS_URL: 'https://redis.example', KITCHEN_REDIS_TOKEN: 'test' };
  const key = 'treg-kitchen:production:daily';
  const reserve = () => reserveRecipe({ env, fetcher: async (_url, options) => Response.json({ result: Number(await redis(...JSON.parse(options.body))) }) });
  try {
    for (let attempt = 0; ; attempt++) {
      try { assert.equal(await redis('PING'), 'PONG'); break; }
      catch (error) { if (attempt === 30) throw error; await setTimeout(35); }
    }
    await assert.rejects(reserve(), { status: 503 });
    assert.equal(await redis('EXISTS', key), '0');
    const today = Math.floor(Number((await redis('TIME')).split('\n')[0]) / 86400);
    await redis('HSET', key, 'day', today, 'spent', 0);
    await assert.rejects(reserve(), { status: 503 });
    await redis('HSET', key, 'version', 1, 'lifetimeSpent', 0);
    await redis('EXPIRE', key, 100);
    await assert.rejects(reserve(), { status: 503 });
    await redis('PERSIST', key);
    await redis('HSET', key, 'day', today - 1, 'spent', dailyBudget, 'lifetimeSpent', lifetimeBudget - 3 * recipeReservation);
    const results = await Promise.allSettled(Array.from({ length: 12 }, reserve));
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 3);
    assert.ok(results.filter((r) => r.status === 'rejected').every((r) => r.reason.status === 429));
    assert.equal(await redis('HGET', key, 'lifetimeSpent'), String(lifetimeBudget));
    assert.equal(await redis('HGET', key, 'spent'), String(recipeReservation * 3));
    assert.equal(await redis('TTL', key), '-1');
    await redis('HSET', key, 'day', today - 1);
    await assert.rejects(reserve(), { status: 429 });
    assert.equal(await redis('HGET', key, 'lifetimeSpent'), String(lifetimeBudget));
  } finally {
    const stopped = new Promise((resolve) => server.once('exit', resolve));
    server.kill();
    await stopped;
    await rm(dir, { recursive: true, force: true });
  }
});

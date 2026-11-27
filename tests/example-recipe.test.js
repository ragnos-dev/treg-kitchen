import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecipeHandler } from '../api/recipe.js';
import { example } from '../lib/example.js';

function response() {
  return { headers: {}, chunks: [], setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.code = code; return this; }, json(body) { this.body = body; },
    write(chunk) { this.chunks.push(chunk); }, end() { this.ended = true; },
    events() { return this.chunks.join('').trim().split('\n').filter(Boolean).map(JSON.parse); } };
}
const ids = ['treg.web.extract', 'firecrawl.web.scrape'];
const liveCost = { type: 'usd', usd: 0.002, per: 'request' };
function catalogFetch(url) {
  if (url.includes('/catalog/search')) {
    assert.equal(new URL(url).searchParams.get('q'), 'extract web page content');
    return { ok: true, json: async () => ({ results: [{ id: ids[0] }] }) };
  }
  const id = decodeURIComponent(url.split('/').at(-1));
  assert.ok(ids.includes(id));
  return { ok: true, json: async () => ({ endpoint: { id, name: 'Extract', cost: liveCost } }) };
}

test('prewritten example searches and inspects both tools with no model spend', async () => {
  const urls = [];
  const res = response();
  await createRecipeHandler({
    generate: async () => assert.fail('example must never reserve model spend'),
    fetchImpl: async (url) => { urls.push(url); return catalogFetch(url); },
  })({ method: 'POST', headers: { accept: 'application/x-ndjson' }, body: { example: true } }, res);
  assert.equal(res.ended, true);
  assert.equal(urls.length, 3);
  assert.deepEqual(res.events().filter((event) => event.type === 'inspect').map((event) => event.endpointId), ids);
  assert.match(res.events()[0].message, /prewritten/);
  const recipe = res.events().at(-1).recipe;
  assert.equal(recipe.sample, true);
  assert.equal(recipe.title, example.title);
  assert.deepEqual(recipe.steps[0].catalog.cost, liveCost);
  assert.deepEqual(recipe.steps[0].alternatives[0].catalog.cost, liveCost);
});

test('prewritten example supports ordinary JSON and rejects catalog ID mismatches', async () => {
  const success = response();
  await createRecipeHandler({ fetchImpl: async (url) => catalogFetch(url), generate: async () => assert.fail('no model') })({ method: 'POST', body: { example: true } }, success);
  assert.equal(success.code, 200);
  assert.equal(success.body.sample, true);
  const mismatch = response();
  await createRecipeHandler({ fetchImpl: async (url) => url.includes('/catalog/search') ? catalogFetch(url) : ({ ok: true, json: async () => ({ endpoint: { id: 'unexpected' } }) }) })({ method: 'POST', body: { example: true } }, mismatch);
  assert.equal(mismatch.code, 502);
  assert.equal(mismatch.body.sample, undefined);
});

test('custom planning requests natural provider quantities and strips untrusted alternative properties', async () => {
  let calls = 0;
  const res = response();
  await createRecipeHandler({ fetchImpl: async (url) => catalogFetch(url), generate: async (run) => run(async (messages) => {
    if (++calls === 1) return { jobs: [{ job: 'extract web page content', input: 'URLs', output: 'text' }], gaps: [] };
    assert.match(messages[0].content, /quantity/);
    assert.match(messages[0].content, /positive whole number/);
    return { title: 'Read pages', gaps: [], steps: [{ title: 'Read', instructions: 'Read pages', endpointId: ids[0], quantity: 12, why: 'Extracts text', input: '12 URLs', output: '12 texts', alternatives: [{ endpointId: ids[0], why: 'Also works', input: 'URLs', output: 'Text', injected: 'discard me' }] }] };
  }) })({ method: 'POST', body: { useCase: 'Read 12 web pages' } }, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.steps[0].quantity, 12);
  assert.equal(res.body.steps[0].alternatives[0].injected, undefined);
});

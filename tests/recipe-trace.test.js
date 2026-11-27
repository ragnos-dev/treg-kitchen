import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecipeHandler } from '../api/recipe.js';

function response() {
  return { headers: {}, chunks: [], setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.code = code; return this; }, json(body) { this.body = body; },
    write(chunk) { this.chunks.push(chunk); }, end() { this.ended = true; },
    events() { return this.chunks.join('').trim().split('\n').filter(Boolean).map(JSON.parse); } };
}
const request = { method: 'POST', headers: { accept: 'application/x-ndjson' }, body: { useCase: 'Find a web page' } };
const job = { job: 'web search', input: 'query', output: 'web page' };
const planned = { title: 'Web research', steps: [{ title: 'Search', instructions: 'Search the web', endpointId: 'search.web', why: 'Finds pages', input: 'Query', output: 'Page', alternatives: [] }], gaps: [] };

test('NDJSON reports live search fallback and inspection before the final recipe', async () => {
  const res = response();
  let calls = 0;
  const handler = createRecipeHandler({
    generate: async (run) => run(async () => ++calls === 1 ? { jobs: [job], gaps: [] } : planned),
    fetchImpl: async (url) => {
      const latest = res.events().at(-1);
      if (url.includes('/catalog/search')) {
        assert.equal(latest.type, 'search');
        assert.equal(latest.query, job.job);
        if (url.includes('engine=agent')) { assert.equal(latest.engine, 'agent'); throw new Error('private upstream failure'); }
        assert.equal(latest.engine, 'default');
        return { ok: true, json: async () => ({ results: [{ id: 'search.web' }] }) };
      }
      assert.deepEqual(latest, { type: 'inspect', endpointId: 'search.web' });
      return { ok: true, json: async () => ({ endpoint: { id: 'search.web', name: 'Search' } }) };
    },
  });
  await handler(request, res);
  assert.equal(res.code, 200);
  assert.match(res.headers['Content-Type'], /application\/x-ndjson/);
  assert.equal(res.ended, true);
  assert.deepEqual(res.events().map((event) => event.type), ['status', 'search', 'search', 'inspect', 'status', 'recipe']);
  assert.equal(res.events().at(-1).recipe.steps[0].endpointId, 'search.web');
  assert.doesNotMatch(res.chunks.join(''), /private upstream failure/);
});

test('NDJSON ends with a safe error when catalog operations fail', async () => {
  const res = response();
  await createRecipeHandler({
    generate: async (run) => run(async () => ({ jobs: [job], gaps: [] })),
    fetchImpl: async () => { throw new Error('upstream credential or internal data'); },
  })(request, res);
  assert.equal(res.ended, true);
  assert.equal(res.events().at(-1).type, 'error');
  assert.doesNotMatch(res.chunks.join(''), /credential|internal data/);
  assert.equal(res.events().filter((event) => event.type === 'search').length, 2);
});

test('NDJSON reports a paused generation without inventing catalog activity', async () => {
  const res = response();
  await createRecipeHandler({ generate: async () => { throw Object.assign(new Error('Generation is paused.'), { code: 'generation_paused', status: 503 }); } })(request, res);
  assert.deepEqual(res.events(), [{ type: 'error', error: 'Generation is paused.' }]);
});

test('six jobs retain every inspected ID while oversized catalog prose is bounded', async () => {
  const res = response();
  let passes = 0;
  let searches = 0;
  const ids = Array.from({ length: 18 }, (_, index) => `tool.${index}`);
  const cost = { type: 'paid', usd: 0.01, per: 'request' };
  await createRecipeHandler({
    generate: async (run) => run(async (messages) => {
      if (++passes === 1) return { jobs: Array.from({ length: 6 }, () => job), gaps: [] };
      assert.ok(Buffer.byteLength(JSON.stringify(messages)) <= 30000);
      const context = JSON.parse(messages[1].content);
      assert.deepEqual(context.candidates.map((item) => item.id), ids);
      assert.equal(context.candidates[0].cost.usd, cost.usd);
      return { ...planned, steps: [{ ...planned.steps[0], endpointId: ids[0] }] };
    }),
    fetchImpl: async (url) => {
      if (url.includes('/catalog/search')) return { ok: true, json: async () => ({ results: ids.slice(searches++ * 3, searches * 3).map((id) => ({ id })) }) };
      const id = decodeURIComponent(url.split('/').at(-1));
      return { ok: true, json: async () => ({ endpoint: { id, name: 'Useful search', summary: 'x'.repeat(20000), cost,
        input: { note: 'y'.repeat(20000), body: { query: { required: true, type: 'string', note: 'z'.repeat(20000) } } } }, call_template: 'a'.repeat(20000), example_response: { example: 'b'.repeat(20000) } }) };
    },
  })({ ...request, headers: {} }, res);
  assert.equal(res.code, 200);
  assert.equal(passes, 2);
  assert.equal(res.body.steps[0].endpointId, ids[0]);
});

test('parallel catalog failures cannot write progress after a terminal error', async () => {
  const res = response();
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  await createRecipeHandler({
    generate: async (run) => run(async () => ({ jobs: [job, { ...job, job: 'image generation' }], gaps: [] })),
    fetchImpl: async (url) => {
      if (url.includes('q=image')) await pending;
      throw new Error('catalog unavailable');
    },
  })(request, res);
  const countAtEnd = res.chunks.length;
  assert.equal(res.events().at(-1).type, 'error');
  release();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(res.chunks.length, countAtEnd);
});

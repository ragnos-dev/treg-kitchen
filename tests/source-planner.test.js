import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecipeHandler, compactEndpoint } from '../api/recipe.js';

const response = () => ({ headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; } });
const brief = source => ({ source, audience: 'Marigold colleagues at private-co.invalid; jane@private-co.invalid' });
const noModel = async () => assert.fail('Structured source plans must not invoke a model or require model funding');
const endpoint = (id, capability) => ({ endpoint: { id, capability, name: capability, summary: 'Public endpoint description', cost: { type: 'per_success', usd: .002, varies: true }, input: { body: { email: { type: 'string', required: true } }, note: 'Provide an existing email address.' }, docs_url: 'https://provider.invalid/docs' }, routing: { contract: { identity: [['email']], output: { full_name: { type: 'string' } }, miss: 'full_name == null' }, plan: [{ endpoint_id: 'provider.people.enrich', accepts: [['email']], usd: .002 }] } });

test('Gmail contact plan stays local and distinguishes human, connector and open skill', async () => {
  const res = response();
  await createRecipeHandler({ generate: noModel, fetchImpl: async () => assert.fail('Gmail-only must not query Treg') })(
    { method: 'POST', body: { useCase: 'Find warm contacts for my consulting work', brief: brief('gmail') } }, res);
  assert.equal(res.code, 200);
  assert.deepEqual(res.body.steps.map(step => step.kind), ['human', 'gmail', 'skill', 'human']);
  assert.ok(res.body.steps.every(step => step.endpointId === null));
  const skill = res.body.steps.find(step => step.kind === 'skill');
  assert.equal(skill.skillId, 'qualify-warm-contacts');
  assert.match(skill.skillUrl, /skills\/qualify-warm-contacts\/SKILL\.md$/);
  assert.match(res.body.steps[0].instructions, /Marigold/);
});

test('combined plan enriches Gmail identities rather than pretending public search proves a warm match', async () => {
  const urls = [];
  const res = response();
  await createRecipeHandler({ generate: noModel, fetchImpl: async url => {
    urls.push(url);
    if (url.includes('/catalog/search')) {
      assert.equal(new URL(url).searchParams.get('q'), 'enrich person professional profile');
      return Response.json({ results: [{ id: 'treg.people.enrich' }] });
    }
    return Response.json(endpoint('treg.people.enrich', 'people.enrich'));
  } })({ method: 'POST', body: { useCase: 'Find warm leads for Marigold at jane@private-co.invalid', brief: brief('both') } }, res);
  assert.equal(res.code, 200);
  assert.equal(urls.length, 2);
  assert.doesNotMatch(urls.join(' '), /Marigold|private-co|jane/);
  assert.deepEqual(res.body.steps.map(step => step.kind), ['human', 'gmail', 'treg', 'skill', 'human']);
  assert.equal(res.body.steps[2].perContact, true);
  assert.match(res.body.steps[2].input, /Gmail contact/);
  assert.deepEqual(res.body.steps[2].catalog.routing.plan, [{ endpoint_id: 'provider.people.enrich', accepts: [['email']], usd: .002 }]);
  assert.equal(res.body.steps[2].catalog.docsUrl, 'https://provider.invalid/docs');
  assert.equal(res.body.steps[2].catalog.needsEmail, true);
});

test('Treg-only lead plan uses audience locally and inspected people search', async () => {
  const res = response();
  await createRecipeHandler({ generate: noModel, fetchImpl: async url => {
    if (url.includes('/catalog/search')) return Response.json({ results: [{ id: 'treg.people.search' }] });
    return Response.json(endpoint('treg.people.search', 'people.search'));
  } })({ method: 'POST', body: { useCase: 'Find new customers', brief: brief('treg') } }, res);
  assert.equal(res.code, 200);
  assert.deepEqual(res.body.steps.map(step => step.kind), ['human', 'treg', 'human']);
  assert.match(res.body.steps[0].instructions, /Marigold/);
});

test('unrelated source request asks what mailbox evidence contributes without inserting prospecting', async () => {
  for (const source of ['gmail', 'both']) {
    const res = response();
    await createRecipeHandler({ generate: noModel, fetchImpl: async () => assert.fail('No justified catalog capability') })(
      { method: 'POST', body: { useCase: 'Transcribe an audio recording', brief: brief(source) } }, res);
    assert.equal(res.code, 200);
    assert.deepEqual(res.body.steps.map(step => step.kind), ['human']);
    assert.match(res.body.gaps.join(' '), /Gmail evidence/);
  }
});

test('email additions choose inspected capability matches, require no use case, and retain per-contact costs', async () => {
  for (const addition of ['find-email', 'verify-email']) {
    const capability = addition === 'find-email' ? 'people.email.find' : 'people.email.verify';
    const res = response();
    await createRecipeHandler({ generate: noModel, fetchImpl: async url => {
      if (url.includes('/catalog/search')) return Response.json({ results: [{ id: 'unrelated.tool' }, { id: `treg.${capability}` }] });
      const id = url.split('/').at(-1);
      return Response.json(endpoint(id, id === 'unrelated.tool' ? 'web.search' : capability));
    } })({ method: 'POST', body: { addition } }, res);
    assert.equal(res.code, 200);
    assert.equal(res.body.steps.length, 1);
    assert.equal(res.body.steps[0].endpointId, `treg.${capability}`);
    assert.equal(res.body.steps[0].perContact, true);
  }
});

test('email addition does not invent an endpoint when inspected search results do not fit', async () => {
  const res = response();
  await createRecipeHandler({ generate: noModel, fetchImpl: async url => url.includes('/catalog/search')
    ? Response.json({ results: [{ id: 'unrelated.tool' }] }) : Response.json(endpoint('unrelated.tool', 'web.search')) })(
    { method: 'POST', body: { addition: 'verify-email' } }, res);
  assert.equal(res.code, 200);
  assert.deepEqual(res.body.steps, []);
  assert.ok(res.body.gaps.length);
});

test('finder skips a result polling endpoint even if its capability is email finding', async () => {
  const res = response();
  await createRecipeHandler({ generate: noModel, fetchImpl: async url => url.includes('/catalog/search')
    ? Response.json({ results: [{ id: 'provider.people.email.find.get' }, { id: 'treg.people.email.find' }] })
    : Response.json(endpoint(url.split('/').at(-1), 'people.email.find')) })(
    { method: 'POST', body: { addition: 'find-email' } }, res);
  assert.equal(res.body.steps[0].endpointId, 'treg.people.email.find');
});

test('combined path does not insert enrichment requiring an identifier Gmail never supplied', async () => {
  const res = response();
  await createRecipeHandler({ generate: noModel, fetchImpl: async url => {
    if (url.includes('/catalog/search')) return Response.json({ results: [{ id: 'provider.people.enrich.linkedin' }] });
    const detail = endpoint('provider.people.enrich.linkedin', 'people.enrich');
    detail.endpoint.input.body = { linkedin_url: { type: 'string', required: true } };
    detail.routing.contract.identity = [['linkedin_url']];
    return Response.json(detail);
  } })({ method: 'POST', body: { useCase: 'Find warm contacts', brief: brief('both') } }, res);
  assert.equal(res.body.steps.filter(step => step.endpointId).length, 0);
  assert.match(res.body.gaps.join(' '), /compatible endpoint/);
});

test('model decomposition only sends allowlisted generic words to public catalog', async () => {
  const res = response();
  let passes = 0;
  await createRecipeHandler({ generate: async run => run(async () => ++passes === 1
    ? { jobs: [{ job: 'search web marigold customer-abc123 secret-example.invalid', input: 'private', output: 'page' }], gaps: [] }
    : { title: 'Search', gaps: [], steps: [{ title: 'Search', instructions: 'Search', why: 'Web search', input: 'query', output: 'page', endpointId: 'web.search', alternatives: [] }] }),
  fetchImpl: async url => {
    if (url.includes('/catalog/search')) {
      assert.equal(new URL(url).searchParams.get('q'), 'search web');
      return Response.json({ results: [{ id: 'web.search' }] });
    }
    return Response.json(endpoint('web.search', 'web.search'));
  } })({ method: 'POST', body: { useCase: 'Find a company page' } }, res);
  assert.equal(res.code, 200);
});

test('structured input is validated before catalog or model access', async () => {
  const handler = createRecipeHandler({ generate: noModel, fetchImpl: async () => assert.fail('Invalid request must stay local') });
  for (const body of [{ addition: 'send-email' }, { useCase: 'Find leads', brief: { source: 'mail', audience: 'a' } }, { useCase: 'Find leads', brief: { source: 'gmail', audience: '' } }]) {
    const res = response();
    await handler({ method: 'POST', body }, res);
    assert.equal(res.code, 400);
  }
});

test('inspection retains independent email ports and route identity alternatives', () => {
  const detail = endpoint('treg.people.email.find', 'people.email.find');
  detail.endpoint.input.body = { full_name: { type: 'string', required: false }, domain: { type: 'string', required: false } };
  detail.routing.contract.identity = [['domain', 'full_name'], ['linkedin_url']];
  detail.routing.contract.output = { email: { type: 'string' }, confidence: { type: 'number' } };
  detail.routing.plan[0].accepts = [['domain', 'full_name'], ['linkedin_url']];
  const compact = compactEndpoint(detail.endpoint.id, detail);
  assert.equal(compact.producesEmail, true);
  assert.equal(compact.needsEmail, false);
  assert.deepEqual(compact.outputFields, ['email', 'confidence']);
  assert.deepEqual(compact.routing.plan[0].accepts, [['domain', 'full_name'], ['linkedin_url']]);
});

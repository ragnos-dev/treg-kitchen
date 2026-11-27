import assert from 'node:assert/strict';
import test from 'node:test';
import { createRecipeHandler } from '../api/recipe.js';
import { dependencyGaps } from '../lib/handoffs.js';

const reply = () => ({ setHeader() {}, status(code) { this.code = code; return this; }, json(data) { this.data = data; } });
const noExternalCalls = () => { throw Error('Unexpected external call'); };

test('custom resource validation fails before planning or any catalog lookup', async () => {
  let requests = 0;
  const res = reply();
  const resource = { name: 'Draft', kind: 'skill', input: 'notes', output: 'brief' };
  await createRecipeHandler({ fetchImpl: () => {requests++;}, generate: noExternalCalls })({ method: 'POST',
    body: { useCase: 'Write a brief', brief: { source: 'cookbook', resources: [resource, resource] } } }, res);
  assert.equal(res.code, 400);
  assert.match(res.data.error, /distinct name/);
  assert.equal(requests, 0);
});

test('handoff gaps propagate across missing producers and clear when ordering is restored', () => {
  const transcribe = {title:'Transcribe',provides:['transcript']};
  const draft = {title:'Write brief',requires:['transcript'],provides:['brief']};
  const review = {title:'Review',requires:['brief']};
  assert.deepEqual(dependencyGaps([transcribe,draft,review]), []);
  assert.equal(dependencyGaps([draft,transcribe,review]).length, 2);
  assert.equal(dependencyGaps([{...transcribe,kind:'blocked'},draft,review]).length, 2);
});

test('cookbook claim plans with public metadata only and keeps the supplied URL out of searches', async () => {
  const requests = [];
  const res = reply();
  const fetchImpl = async (url, options) => {
    const path = new URL(url);
    requests.push(path);
    assert.equal(path.origin, 'https://treg.to');
    assert.equal(options.method ?? 'GET', 'GET');
    if (path.pathname === '/catalog/search') return Response.json({results:[{id:'treg.web.extract'}]});
    assert.equal(path.pathname, '/catalog/endpoints/treg.web.extract');
    return Response.json({ endpoint:{id:'treg.web.extract',name:'Read page text',capability:'web.extract',
      summary:'Extract readable page text from the supplied URL',input:{body:{url:{type:'string',required:true}}},output:{body:{text:{type:'string'}}}}});
  };
  await createRecipeHandler({fetchImpl,generate:noExternalCalls})({method:'POST',body:{
    useCase:'Check the company claim that Orchid publishes a handbook',brief:{source:'cookbook',inputs:'Company URL: https://private-fixture.invalid/handbook'}}},res);
  assert.equal(res.code,200);
  assert.ok(requests.every(url=>!url.href.includes('private-fixture') && !url.href.includes('Orchid')));
  assert.ok(res.data.steps.some(step=>step.endpointId==='treg.web.extract'));
  assert.ok(res.data.steps.some(step=>step.skillId==='check-source-evidence'));
  assert.ok(res.data.planningLog.some(event=>event.type==='inspect' && event.endpointId==='treg.web.extract'));
});

test('recording recipe prefers a declared compatible transcriber without reading files or calling a model or catalog',async()=>{
  const res=reply();
  let calls=0;
  await createRecipeHandler({fetchImpl:()=>{calls++;throw Error('external call');},generate:noExternalCalls})({method:'POST',body:{
    useCase:'Turn two recordings into a brief using my team template',
    brief:{source:'cookbook',inputs:'Two recording files and local template.md',resources:[
      {kind:'tool',name:'Team transcriber',input:'One recording file',output:'Timestamped transcript',source:'private/tools.md'}]}
  }},res);
  assert.equal(res.code,200);
  assert.equal(calls,0);
  assert.ok(res.data.steps.some(step=>step.kind==='custom' && step.resourceSource==='private/tools.md'));
  assert.ok(res.data.steps.some(step=>step.skillId==='write-template-brief'));
});

test('inserting an arbitrary catalog endpoint reads only its exact public metadata record', async () => {
  const res = reply(), calls = [];
  await createRecipeHandler({generate:noExternalCalls,fetchImpl:async url => {
    calls.push(url);
    return Response.json({endpoint:{id:'demo.weather.lookup',name:'Read a forecast',input:{body:{city:{required:true}}},output:{body:{forecast:{}}}}});
  }})({method:'POST',body:{addition:'catalog-tool',endpointId:'demo.weather.lookup'}},res);
  assert.deepEqual(calls,['https://treg.to/catalog/endpoints/demo.weather.lookup']);
  assert.equal(res.data.steps[0].endpointId,'demo.weather.lookup');
  const rejected = reply();
  await createRecipeHandler({fetchImpl:noExternalCalls})({method:'POST',body:{addition:'catalog-tool',endpointId:'https://example.org/'}},rejected);
  assert.equal(rejected.code,400);
});

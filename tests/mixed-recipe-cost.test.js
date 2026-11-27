import assert from 'node:assert/strict';
import test from 'node:test';
import { estimateRecipeCost, recipeMarkdown } from '../lib/recipe.js';

test('per-person costs multiply once by people and runs, independently of connector and skill pricing', () => {
  const step = { endpointId:'treg.test', title:'Look up a person', perContact:true, quantity:2,
    catalog:{cost:{type:'per_call',usd:.01}}, alternatives:[], input:'contact',output:'profile',why:'enrich',instructions:'Read' };
  const recipe = {title:'Warm contacts',steps:[{...step,endpointId:null,kind:'gmail'},step],runs:3,peoplePerRun:20,gaps:[]};
  const cost = estimateRecipeCost(recipe);
  assert.equal(cost.minUsd,1.2);
  assert.equal(cost.humanSteps,0);
  assert.equal(cost.excludedSteps,1);
  const markdown = recipeMarkdown(recipe);
  assert.match(markdown,/40 calls \(2 per person\)/);
  assert.match(markdown,/Connector: Gmail/);
  assert.match(markdown,/People per run: 20/);
});

test('human summary and agent handoff reflect edited steps, connections and the outcome', async () => {
  const { recipeTldr } = await import('../lib/recipe.js');
  const recipe = { title: 'Workshop contacts', goal: 'Reconnect after the workshop', audience: 'Past attendees',
    source: 'gmail', mode: 'catalog', gaps: [], steps: [{title:'Search Gmail for replies',kind:'gmail',endpointId:null,
      instructions:'Read matching threads in your own agent.',why:'Existing relationships',input:'Authorized account',
      output:'Contacts with replies',alternatives:[]}] };
  assert.match(recipeTldr(recipe), /search Gmail for replies/);
  recipe.steps[0].title = 'Shortlist workshop contacts';
  assert.match(recipeTldr(recipe), /shortlist workshop contacts/);
  assert.match(recipeMarkdown(recipe), /Goal: Reconnect after the workshop/);
  assert.match(recipeMarkdown(recipe), /Audience and inputs: Past attendees/);
  assert.match(recipeMarkdown(recipe), /connect the Gmail account/);
  assert.equal(estimateRecipeCost(recipe).label, 'No Treg calls');
});

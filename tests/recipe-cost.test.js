import test from "node:test";
import assert from "node:assert/strict";
import { catalogCost, cleanRecipe, estimateRecipeCost, estimateStepCost, positiveInteger, recipeMarkdown } from "../lib/recipe.js";

const tool = (cost, quantity = 1) => ({ title: "Search", endpointId: "test.search", quantity,
  catalog: { id: "test.search", cost }, why: "Fits", input: "Name", output: "URL", instructions: "Search", alternatives: [] });
const fixed = { type: "per_call", value: 5, per: 1000, currency: "USD", unit: "call", usd: 0.005 };

test("flat catalog rates scale by calls per run and number of runs", () => {
  const step = estimateStepCost(tool(fixed, 4), 100);
  assert.equal(step.kind, "exact");
  assert.equal(step.minUsd, 2);
  assert.equal(step.maxUsd, 2);
  const recipe = estimateRecipeCost({ steps: [tool(fixed, 4), tool(fixed, 2)], runs: 100 });
  assert.equal(recipe.kind, "exact");
  assert.equal(recipe.minUsd, 3);
});

test("catalog normalized dollars are used without treating credits as USD", () => {
  assert.equal(catalogCost({ cost: { type: "per_call", value: 1, currency: "credit", usd: 0.002 } }).minUsd, 0.002);
  assert.equal(catalogCost({ cost: { type: "per_call", value: 1, currency: "credit" } }).minUsd, null);
  assert.equal(catalogCost({ cost: { ...fixed, usd: undefined } }).minUsd, 0.005);
});

test("settled table ranges differ from variable usage holds and routed starting prices", () => {
  const table = { type: "per_success", settle: "table", table: [{ value: 0.003 }], usd_min: 0.003, usd: 0.012 };
  assert.deepEqual([catalogCost({ cost: table }).kind, estimateStepCost(tool(table, 2), 10).maxUsd], ["range", 0.24]);
  assert.equal(catalogCost({ cost: { ...table, settle: "usage" } }).kind, "variable");
  assert.equal(catalogCost({ cost: { ...table, settle: "usage" } }).maxUsd, null);
  const routed = catalogCost({ cost: { ...fixed, varies: true, note: "Provider waterfall varies" } });
  assert.equal(routed.kind, "starting");
  assert.equal(routed.maxUsd, null);
  assert.equal(catalogCost({ cost: { ...fixed, note: "$0.004 to $0.2 per hit across 5 providers" } }).kind, "starting");
});

test("unknown, BYOK, per-unit and human costs are never silently zero", () => {
  for (const cost of [undefined, {}, { type: "byok", usd: 0 }, { type: "per_success", usd: null, note: "The generated row is BYOK-only." }, { ...fixed, unit: "second" }, { ...fixed, usd: -1, value: -1 }]) {
    assert.equal(estimateStepCost(tool(cost)).minUsd, null);
  }
  const human = { ...tool(null), endpointId: null };
  assert.equal(estimateStepCost(human).kind, "human");
  const subtotal = estimateRecipeCost({ steps: [tool(fixed), tool(null), human], runs: 10 });
  assert.equal(subtotal.kind, "partial");
  assert.equal(subtotal.minUsd, 0.05);
  assert.equal(subtotal.maxUsd, null);
  assert.equal(subtotal.excludedSteps, 1);
  assert.equal(subtotal.humanSteps, 1);
  assert.match(subtotal.label, /known subtotal.*1 unpriced step/);
  assert.equal(estimateRecipeCost({ steps: [tool(null)] }).minUsd, null);
  assert.equal(estimateRecipeCost({ steps: [human] }).kind, "human");
});

test("explicit catalog free prices stay zero with account quota notes", () => {
  const free = { type: "free", value: 0, currency: "USD", note: "Consumes sending quota" };
  assert.equal(estimateStepCost(tool(free)).minUsd, 0);
  assert.match(estimateStepCost(tool(free)).note, /quota/);
});

test("old recipes default to one run and call; invalid quantities cannot multiply estimates", () => {
  for (const value of [0, -1, 1.5, "5", NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.equal(positiveInteger(value), 1);
  assert.equal(positiveInteger(5), 5);
  assert.equal(estimateStepCost(tool(fixed, 0), -2).minUsd, 0.005);
});

test("cleanRecipe grounds prices in inspected metadata and ignores model price claims", () => {
  const raw = tool({ ...fixed, usd: 999 }, 3);
  const recipe = cleanRecipe({ title: "Workflow", steps: [raw], gaps: [], runs: 10 }, new Map([[raw.endpointId, { id: raw.endpointId, cost: fixed, huge: "unneeded" }]]));
  assert.equal(recipe.steps[0].catalog.cost.usd, 0.005);
  assert.equal(recipe.steps[0].catalog.huge, undefined);
  assert.equal(recipe.steps[0].quantity, 3);
  assert.equal(recipe.runs, 10);
});

test("Markdown preserves volume, quantities, unknowns, human steps and assumptions", () => {
  const markdown = recipeMarkdown({ title: "Example", steps: [tool(fixed, 3), tool(null), { ...tool(null), endpointId: null }], runs: 25, gaps: [] });
  assert.match(markdown, /Runs: 25/);
  assert.match(markdown, /Quantity per run: 3 calls/);
  assert.match(markdown, /Cost for 25 run\(s\):/);
  assert.match(markdown, /Unknown price/);
  assert.match(markdown, /Human time not priced/);
  assert.match(markdown, /No retries/);
  assert.match(markdown, /No catalog tools were executed/);
});

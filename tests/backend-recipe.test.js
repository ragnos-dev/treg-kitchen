import test from "node:test";
import assert from "node:assert/strict";
import { createRecipeHandler } from "../api/recipe.js";
import { catalogEndpointUrl, cleanRecipe, recipeMarkdown } from "../lib/recipe.js";

function response() {
  return { headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}

test("planner searches live catalog, inspects selected tools, and returns editable source links", async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    return {
      ok: true,
      json: async () => url.includes("/catalog/search")
        ? { results: [{ id: "exa.web.search.lite", name: "Search" }] }
        : { endpoint: { id: "exa.web.search.lite", name: "Search", input: { queryParams: { query: { required: true, type: "string" } } } } },
    };
  };
  const generate = async (fn) => fn(async (_messages, _maxTokens) => {
    if (_messages[0].content.startsWith("Turn the use case")) return { jobs: [{ job: "find official company site", input: "company name", output: "official domain" }], gaps: [] };
    return { title: "Find the official site", steps: [{ title: "Find domain", instructions: "Search by company name", endpointId: "exa.web.search.lite", why: "Searches the web for the requested company", input: "Company name", output: "Candidate official domain", alternatives: [] }], gaps: [] };
  });
  const handler = createRecipeHandler({ fetchImpl, generate });
  const res = response();
  await handler({ method: "POST", body: { useCase: "Find the official website for Example Co" } }, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.steps[0].endpointUrl, catalogEndpointUrl("exa.web.search.lite"));
  assert.equal(urls.length, 2);
  assert.match(urls[0], /catalog\/search/);
  assert.match(urls[1], /catalog\/endpoints\/exa.web.search.lite/);
});

test("planner rejects invalid request and non-POST method", async () => {
  const handler = createRecipeHandler({ generate: async () => assert.fail("must not generate") });
  const badMethod = response();
  await handler({ method: "GET" }, badMethod);
  assert.equal(badMethod.code, 405);
  assert.equal(badMethod.headers.Allow, "POST");
  const badBody = response();
  await handler({ method: "POST", body: { useCase: " " } }, badBody);
  assert.equal(badBody.code, 400);
});

test("recipe cleanup refuses an endpoint absent from inspection data", () => {
  assert.throws(() => cleanRecipe({ title: "x", gaps: [], steps: [{ title: "x", instructions: "x", endpointId: "invented.id", why: "x", input: "x", output: "x", alternatives: [] }] }, new Map()), /outside the live catalog/);
});

test("recipe can ask for missing information without inventing a tool step", async () => {
  const generate = async (fn) => fn(async (messages) => messages[0].content.startsWith("Turn the use case")
    ? { jobs: [], gaps: ["Which account should be used?"] }
    : assert.fail("must not run a second pass"));
  const handler = createRecipeHandler({ generate });
  const res = response();
  await handler({ method: "POST", body: { useCase: "Read my account data" } }, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.steps.length, 0);
  assert.deepEqual(res.body.gaps, ["Which account should be used?"]);
});

test("markdown exports endpoint links and user-authored instructions", () => {
  const text = recipeMarkdown({ title: "Example", gaps: [], steps: [{ title: "Search", endpointId: "exa.web.search.lite", why: "Fits", input: "Name", output: "URL", instructions: "Keep edits", alternatives: [] }] });
  assert.match(text, /https:\/\/treg.to\/catalog\/endpoints\/exa.web.search.lite/);
  assert.match(text, /Keep edits/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { planCookbook } from "../lib/cookbook.js";
import { dependencyGaps } from "../lib/handoffs.js";
import { cleanRecipe } from "../lib/recipe.js";

const tool = (id, capability, input, output, extra = {}) => ({
  id, capability, requiredInputs: input.map(name => ({ name })), outputFields: output, ...extra,
});
const reader = tool("treg.web.extract", "web.extract", ["url"], ["pages", "count"], {
  summary: "Extract clean page content from URLs.",
  routing: { plan: [{ endpoint_id: "provider.web.scrape", accepts: [["url"]] }] },
});
const lookup = tool("hunter.x.domain-finder", "companies.domain.find", ["company"], ["data", "meta"], {
  exampleOutput: '{"data":[{"domain":"example.org","company_name":"Example"}]}',
});
const unused = () => { assert.fail("Unexpected discovery"); };

test("supplied company URL skips identity discovery and produces a cite-or-unsupported handoff", async () => {
  const queries = [];
  const draft = await planCookbook({
    useCase: "Check the company claim that Marigold offers two community programs.",
    inputs: "Company URL: https://private-project.invalid/programs",
    discover: async (query) => {
      queries.push(query);
      return [
        tool("wrong.web.extract", "web.extract", ["url", "video_id"], ["markdown"]),
        tool("old.web.extract", "web.extract", ["url"], ["text"], { status: "Retired" }),
        reader,
        tool("provider.web.scrape", "web.scrape", ["url"], ["markdown"]),
      ];
    },
  });
  assert.deepEqual(queries, ["extract web page text from URL"]);
  assert.deepEqual(draft.steps.map(step => [step.kind, step.endpointId]), [["treg", reader.id], ["skill", null]]);
  assert.equal(draft.steps[0].alternatives[0].endpointId, "provider.web.scrape");
  assert.match(draft.steps[0].input, /private-project\.invalid/);
  assert.equal(draft.steps[1].skillId, "check-source-evidence");
  assert.match(draft.steps[1].output, /cited passage.*unsupported/i);
  assert.deepEqual(draft.steps[0].provides, draft.steps[1].requires);
  assert.deepEqual(draft.gaps, []);
});

test("company-name path resolves official identity first and tolerates failed extraction discovery", async () => {
  const queries = [];
  const draft = await planCookbook({
    useCase: 'Check whether the company claim "Marigold publishes its handbook" is supported.',
    inputs: "Company: Marigold Industries",
    discover: async (query) => {
      queries.push(query);
      if (query.startsWith("search")) return [lookup];
      throw Error("Catalog down");
    },
  });
  assert.deepEqual(queries, ["search official company website by name", "extract web page text from URL"]);
  assert.deepEqual(draft.steps.map(step => step.endpointId), [lookup.id, null, null]);
  assert.deepEqual(draft.steps[0].provides, draft.steps[1].requires);
  assert.match(draft.gaps.join(" "), /no inspected page-reading endpoint/i);
});

test("supplied page text is not fetched again and retains the citation dependency", async () => {
  const draft = await planCookbook({
    useCase: 'Check the company claim "Support is open on Saturday" against the page.',
    inputs: "Page text: We support customers from Monday to Saturday.",
    discover: unused,
  });
  assert.deepEqual(draft.steps.map(step => step.skillId), ["check-source-evidence"]);
  assert.deepEqual(draft.steps[0].requires, []);
  assert.match(draft.gaps.join(" "), /original URL/);
});

test("a supplied transcript and team template filename do not trigger transcription or a missing-template gap", async () => {
  const draft = await planCookbook({
    useCase: "Turn these transcripts into a brief using the team template",
    inputs: "TeamTemplate.md, transcript already supplied as Walkthrough.vtt",
    discover: unused,
  });
  assert.deepEqual(draft.steps.map(step => step.kind), ["human", "skill", "human"]);
  assert.equal(draft.steps[1].skillId, "write-template-brief");
  assert.match(draft.steps[1].output, /timestamp|transcript citations/);
  assert.deepEqual(dependencyGaps(draft.steps), []);
  assert.deepEqual(draft.gaps, []);
});

test("recording planner prefers declared per-item transcriber, keeps its contract, and asks for undocumented source", async () => {
  const resources = [{ kind: "tool", name: "Team transcriber", input: "One audio file", output: "Timestamped transcript" }];
  const draft = await planCookbook({
    useCase: "Turn two meeting recordings into a brief using my team's template.",
    inputs: "Audio: North.wav and South.wav",
    resources,
    discover: unused,
  });
  assert.equal(draft.peoplePerRun, 2);
  assert.equal(draft.steps[0].perItem, true);
  assert.deepEqual(draft.steps.map(step => step.kind), ["custom", "skill", "human"]);
  assert.match(draft.steps[0].instructions, /Declared input: One audio file/);
  assert.match(draft.gaps.join(" "), /team's template/);
  assert.match(draft.gaps.join(" "), /identify and verify the source for Team transcriber/);
});

test("recording planner excludes social-post extraction and leaves an honest local dependency", async () => {
  const queries = [];
  const draft = await planCookbook({
    useCase: "Turn these recordings into a brief using our template.",
    inputs: "Audio recording: intake.wav; template: agenda.md",
    discover: query => {
      queries.push(query);
      return [tool("social.facebook.post.transcript", "facebook.post.transcript", ["url"], ["transcript"])];
    },
  });
  assert.deepEqual(queries, ["transcribe audio speech to timestamped text"]);
  assert.equal(draft.steps[0].kind, "blocked");
  assert.match(draft.gaps.join(" "), /available local transcriber/);
  const cleaned = cleanRecipe(draft, new Map());
  assert.match(dependencyGaps(cleaned.steps).join(" "), /source-linked transcript/);
});

test("warm relationships come from Gmail, while a public enrichment step supplies only fit details", async () => {
  const queries = [];
  const draft = await planCookbook({
    useCase: "Find people I already know in Gmail who fit my audience, and check current roles.",
    inputs: "Audience: Independent design studios; exclude generic mailing lists",
    discover: query => {
      queries.push(query);
      return [
        tool("wrong.people.enrich", "people.enrich", ["profile_url"], ["title"]),
        tool("good.people.enrich", "people.enrich", ["email"], ["title", "company"]),
      ];
    },
  });
  assert.deepEqual(queries, ["enrich person professional profile"]);
  assert.deepEqual(draft.steps.map(step => step.kind), ["human", "gmail", "treg", "skill", "human"]);
  assert.equal(draft.steps[2].endpointId, "good.people.enrich");
  assert.equal(draft.steps[3].skillId, "qualify-warm-contacts");
  assert.match(draft.steps[1].why, /prior relationship/);
  assert.match(draft.steps[2].why, /does not establish any relationship/);
  assert.deepEqual(dependencyGaps(draft.steps), []);
});

test("an unrelated workflow can compose a declared tool, inspected operation and declared skill", async () => {
  const resources = [
    { kind: "tool", name: "Howland Reader", input: "Opt-in CSV file", output: "Email addresses", source: "/private/reader.md" },
    { kind: "skill", name: "Juniper Review", input: "Email verification status", output: "Labeled triage sheet", source: "/private/review/SKILL.md" },
    { kind: "tool", name: "Unrelated Weather", input: "Airport code", output: "Weather forecast", source: "/private/weather.md" },
  ];
  const selected = tool("provider.people.email.verify", "people.email.verify", ["email"], ["email", "status"]);
  const queries = [];
  const draft = await planCookbook({
    useCase: "Use Howland Reader, then verify the email addresses, then use Juniper Review to produce a triage sheet.",
    inputs: "Opt-in CSV file people.private.csv",
    resources,
    discover: query => {
      queries.push(query);
      return [tool("wrong.people.email.find", "people.email.find", ["name"], ["email"]), selected];
    },
  });
  assert.deepEqual(queries, ["verify email address"]);
  assert.deepEqual(draft.steps.map(step => step.kind), ["custom", "treg", "custom", "human"]);
  assert.equal(draft.steps[0].resourceName, "Howland Reader");
  assert.equal(draft.steps[1].endpointId, selected.id);
  assert.equal(draft.steps[2].resourceName, "Juniper Review");
  assert.deepEqual(draft.steps[1].requires, draft.steps[0].provides);
  assert.deepEqual(draft.steps[2].requires, draft.steps[1].provides);
  assert.deepEqual(draft.gaps, []);
});

test("generic composition inspects multiple explicit operations and keeps unknown stages visible", async () => {
  const queries = [];
  const draft = await planCookbook({
    useCase: "Extract product prices and then verify email addresses and then prepare an escalation memo.",
    inputs: "Product URLs and consented email addresses.",
    discover: query => {
      queries.push(query);
      if (query.includes("product")) return [
        tool("product.extract.price", "products.price.extract", ["product_url"], ["product", "price"]),
      ];
      return [];
    },
  });
  assert.deepEqual(queries, ["extract product price", "verify email address"]);
  assert.deepEqual(draft.steps.map(step => step.kind), ["treg", "blocked", "blocked", "human"]);
  assert.match(draft.gaps.join(" "), /method for email/);
  assert.match(draft.steps[2].instructions, /prepare an escalation memo/);
});

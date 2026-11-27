import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { cleanRecipe, estimateRecipeCost, recipeMarkdown, recipeTldr } from "../lib/recipe.js";

const step = {
  title: "Compare each passage",
  instructions: "Check the exact wording against the claim.",
  endpointId: null,
  why: "The passage is the evidence needed to make the comparison.",
  input: "Source text and claim",
  output: "Verdict and its citation",
  alternatives: [],
};
const draft = steps => ({ title: "Check the supplied source", steps, gaps: [] });

test("repository skills use the published file path in a compound recipe", async () => {
  const ids = ["check-source-evidence", "write-template-brief", "qualify-warm-contacts"];
  const recipe = cleanRecipe(draft([
    step, step, step, step, step,
    ...ids.map(skillId => ({ ...step, kind: "skill", skillId, skillUrl: "https://unverified.example" })),
  ]), new Map());
  assert.equal(recipe.steps.length, 8);
  for (const [index, id] of ids.entries()) {
    const skill = recipe.steps[index + 5];
    assert.equal(skill.kind, "skill");
    assert.equal(skill.skillUrl, `https://github.com/ragnos-dev/treg-kitchen/blob/main/skills/${id}/SKILL.md`);
    const file = await readFile(new URL(`../skills/${id}/SKILL.md`, import.meta.url), "utf8");
    assert.match(file, new RegExp(`^name: ${id}$`, "m"));
  }
});

test("custom resource provenance, evidence and unknown cost survive export", () => {
  const resources = [{ kind: "tool", name: "Local evidence reader", input: "Documents", output: "Page text", source: "Local tools manifest" }];
  const recipe = cleanRecipe(draft([{
    ...step, kind: "custom", resourceName: resources[0].name, resourceKind: "tool",
    resourceSource: "https://unverified.example", perItem: true, quantity: 2,
    requires: ["document", "document", " "], provides: ["page-text"], evidence: "Readable text and document path are present.",
  }]), new Map(), resources);
  const cleaned = recipe.steps[0];
  assert.equal(cleaned.kind, "custom");
  assert.equal(cleaned.resourceSource, "Local tools manifest");
  assert.equal(cleaned.endpointUrl, null);
  assert.deepEqual(cleaned.requires, ["document"]);
  assert.deepEqual(cleaned.provides, ["page-text"]);
  Object.assign(recipe, { source: "cookbook", inputs: "Supplied documents", peoplePerRun: 3, runs: 2,
    planningLog: [{ type: "search", query: "read web page" }, { type: "inspect", endpointId: "test.web.read" }, { type: "status", message: "ignored status" }] });
  const cost = estimateRecipeCost(recipe);
  assert.equal(cost.kind, "unknown");
  assert.equal(cost.excludedSteps, 1);
  assert.equal(cost.humanSteps, 0);
  assert.equal(cost.steps[0].quantity, 6);
  const markdown = recipeMarkdown(recipe);
  assert.match(markdown, /Items per run: 3/);
  assert.match(markdown, /6 calls \(2 per item\)/);
  assert.match(markdown, /User-supplied tool: Local evidence reader/);
  assert.match(markdown, /User-supplied source \(verify before use\): Local tools manifest/);
  assert.match(markdown, /Available inputs: Supplied documents/);
  assert.match(markdown, /Accept when: Readable text and document path are present/);
  assert.match(markdown, /Searched: read web page/);
  assert.match(markdown, /Inspected: test.web.read/);
  assert.doesNotMatch(markdown, /ignored status|unverified.example/);
  assert.match(recipeTldr(recipe), /Your agent will compare each passage/);
});

test("undeclared resources and unknown repository skills block the step without publishing a link", () => {
  const recipe = cleanRecipe(draft([
    { ...step, kind: "custom", resourceName: "Unlisted tool", resourceKind: "tool", resourceSource: "https://unverified.example", provides: ["claimed-result"] },
    { ...step, title: "Write the draft", kind: "skill", skillId: "invented", skillUrl: "https://unverified.example" },
    { ...step, title: "Supply the missing text", kind: "blocked", requires: ["source"], provides: ["text"] },
  ]), new Map());
  assert.deepEqual(recipe.steps.map(item => item.kind), ["blocked", "blocked", "blocked"]);
  assert.equal(recipe.steps[0].provides, undefined);
  assert.equal(recipe.steps[2].provides, undefined);
  assert.deepEqual(recipe.steps[2].requires, ["source"]);
  assert.match(recipe.gaps[0], /Confirm a source and contract/);
  assert.match(recipeTldr(recipe), /Confirm a source and contract/);
  assert.match(recipeMarkdown(recipe), /Missing dependency/);
  assert.doesNotMatch(JSON.stringify(recipe), /unverified.example/);
});

function runCli(args, input) {
  const script = fileURLToPath(new URL("../bin/treg-kitchen.js", import.meta.url));
  const result = spawnSync(process.execPath, [script, "--format", "json", ...args], { encoding: "utf8", input, timeout: 5_000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return JSON.parse(result.stdout);
}

test("positional CLI plans with declared resources and volume, and stdin accepts legacy requests", () => {
  const tool = { kind: "tool", name: "Team transcriber", input: "One recording file", output: "Timestamped transcript", source: "private/tools.md" };
  const cookbook = runCli([
    "--inputs", "Two recording files and local template.md", "--resource", JSON.stringify(tool),
    "--items", "2", "--runs", "3", "Turn two recordings into a brief using my team template",
  ]);
  assert.equal(cookbook.source, "cookbook");
  assert.equal(cookbook.peoplePerRun, 2);
  assert.equal(cookbook.runs, 3);
  assert.equal(cookbook.steps.find(step => step.kind === "custom")?.resourceSource, tool.source);
  assert.equal(cookbook.steps.find(step => step.kind === "skill")?.skillId, "write-template-brief");
  const legacy = runCli(["--stdin", "--people", "4"], JSON.stringify({ useCase: "Find warm contacts", brief: { source: "gmail", audience: "Past collaborators" } }));
  assert.equal(legacy.source, "gmail");
  assert.equal(legacy.peoplePerRun, 4);
  assert.ok(legacy.steps.some(step => step.kind === "gmail"));
});

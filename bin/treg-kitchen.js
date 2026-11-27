#!/usr/bin/env node
import { parseArgs } from "node:util";
import { createRecipeHandler } from "../api/recipe.js";
import { recipeMarkdown, recipeTldr } from "../lib/recipe.js";

const usage = `treg-kitchen [--inputs "files, URLs or other available inputs"]
             [--resource '{"kind":"tool","name":"Tool name","input":"...","output":"...","source":"..."}']
             [--items 20] [--runs 1] [--format markdown|json] "your goal"

Repeat --resource to declare tools or skills that your executing agent can use.
Legacy options: --source treg|gmail|both, --audience "buyer profile", --people 20.

Use --stdin for a JSON planning request instead of a positional goal.
Output goes to stdout. This command plans locally using public catalog reads.
Select Gmail to plan a mailbox step. To read mail, use your own authorized connector.`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      source: { type: "string" },
      audience: { type: "string" },
      inputs: { type: "string" },
      resource: { type: "string", multiple: true },
      items: { type: "string" },
      people: { type: "string" },
      runs: { type: "string" },
      format: { type: "string", default: "markdown" },
      help: { type: "boolean", short: "h" },
      stdin: { type: "boolean" },
    },
  });
  if (values.help) return console.log(usage);
  if (!["markdown", "json"].includes(values.format)) throw Error("Choose markdown or json for --format.");
  if (values.items !== undefined && values.people !== undefined) throw Error("Use one of --items or --people.");
  let body;
  if (values.stdin) {
    if (positionals.length || [values.source, values.audience, values.inputs, values.resource].some(value => value !== undefined))
      throw Error("With --stdin, supply the goal and brief in JSON.");
    let input = "";
    for await (const chunk of process.stdin) {
      input += chunk;
      if (Buffer.byteLength(input) > 16_384) throw Error("Planning request is too large.");
    }
    body = JSON.parse(input);
  } else {
    const useCase = positionals.join(" ").trim();
    if (!useCase) throw Error(usage);
    if (values.source !== undefined && !["cookbook", "treg", "gmail", "both"].includes(values.source))
      throw Error("Choose cookbook, treg, gmail or both for --source.");
    const legacy = values.audience !== undefined || (values.source && values.source !== "cookbook");
    if (legacy) {
      if (values.source === "cookbook" || values.inputs !== undefined || values.resource)
        throw Error("Use --inputs and --resource in cookbook mode, or --audience with the legacy planner.");
      if (["gmail", "both"].includes(values.source) && !values.audience?.trim())
        throw Error("Supply --audience so the mailbox step has a qualification criterion.");
      body = values.audience
        ? { useCase, brief: { source: values.source || "treg", audience: values.audience } }
        : { useCase };
    } else {
      const resources = (values.resource || []).map(raw => {
        try {
          const resource = JSON.parse(raw);
          if (resource && typeof resource === "object" && !Array.isArray(resource)) return resource;
        } catch {
          // Report an error with the option name so it can be corrected without echoing the value.
        }
        throw Error("Supply one JSON object per --resource.");
      });
      body = { useCase, brief: { source: "cookbook", inputs: values.inputs || "", resources } };
    }
  }
  function count(value) {
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n < 1 || n > 1_000_000)
      throw Error("Counts must be whole numbers between 1 and 1,000,000.");
    return n;
  }
  const runs = count(values.runs ?? 1);
  const volume = values.items ?? values.people;
  const peoplePerRun = volume === undefined ? undefined : count(volume);
  let status = 200;
  let recipe;
  // Explicitly choose the catalog planner, even on a machine with a paid model configured.
  const handler = createRecipeHandler({
    generate: async () => {
      throw Object.assign(Error("Catalog-only mode."), { code: "generation_paused" });
    },
  });
  await handler(
    { method: "POST", body },
    {
      setHeader() {},
      status(code) {
        status = code;
        return this;
      },
      json(result) {
        recipe = result;
      },
    },
  );
  if (status >= 400 || !Array.isArray(recipe?.steps))
    throw Error(recipe?.error || "Could not build a recipe.");
  recipe.runs = runs;
  recipe.peoplePerRun = peoplePerRun ?? recipe.peoplePerRun ?? 1;
  const tldr = recipeTldr(recipe);
  console.log(
    values.format === "json"
      ? JSON.stringify({ ...recipe, tldr }, null, 2)
      : `## TL;DR\n\n${tldr}\n\n${recipeMarkdown(recipe)}`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

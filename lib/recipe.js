export const MAX_STEPS = 6;

export function catalogEndpointUrl(endpointId) {
  return `https://treg.to/catalog/endpoints/${encodeURIComponent(endpointId)}`;
}

// Shared by the API, browser and Markdown export. No provider calls are made here.
export function positiveInteger(value, fallback = 1) {
  return Number.isSafeInteger(value) && value > 0 && value <= 1_000_000 ? value : fallback;
}

export function formatUsd(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Unknown";
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;
}

const money = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;

export function catalogCost(catalog) {
  const cost = catalog?.cost;
  const base = { kind: "unknown", minUsd: null, maxUsd: null, note: cost?.note || "No usable public USD price was inspected.",
    sourceUrl: cost?.source_url || null, checked: cost?.checked || null };
  if (!cost || typeof cost !== "object") return base;
  if (/byok|variable|subscription|token|minute|second|byte/i.test(cost.type || "") || /\bbyok\b|bring your own/i.test(cost.note || "")) {
    return { ...base, kind: "variable", note: cost.note || "Usage or account pricing varies; no per-call total is established." };
  }
  const usd = money(cost.usd) ? cost.usd : cost.currency === "USD" && money(cost.value)
    ? cost.value / (money(cost.per) && cost.per > 0 ? cost.per : 1) : null;
  const minimum = money(cost.usd_min) ? cost.usd_min : null;
  if (cost.type === "free" && usd === 0) return { ...base, kind: "exact", minUsd: 0, maxUsd: 0, note: cost.note || "Catalog lists no per-call charge; account costs may still apply." };
  // Usage holds and routed-provider prices are not exact charges or guaranteed ceilings.
  const routed = cost.varies || /across \d+ providers/i.test(cost.note || "");
  if (routed || cost.settle === "usage" || cost.usage) {
    const hasFlatBase = !cost.table && money(usd) && usd > 0 && ["per_call", "per_success"].includes(cost.type);
    const lower = money(minimum) && cost.settle !== "usage" ? minimum : routed && cost.settle !== "usage" ? usd
      : hasFlatBase && !cost.fallback ? usd : null;
    return { ...base, kind: money(lower) ? "starting" : "variable", minUsd: lower, maxUsd: null,
      note: cost.note || "Actual charge depends on usage or provider routing; catalog holds are not a final price." };
  }
  if (Array.isArray(cost.table) && cost.table.length) {
    // usd_min and usd are catalog-normalized USD bounds. Never treat a credit table as dollars.
    if (money(minimum) && money(usd) && usd >= minimum && cost.settle === "table") {
      return { ...base, kind: minimum === usd ? "exact" : "range", minUsd: minimum, maxUsd: usd,
        note: cost.note || "Catalog table range; exact request parameters have not been selected." };
    }
    return { ...base, kind: money(minimum) ? "starting" : "variable", minUsd: minimum,
      note: cost.note || "Price depends on request parameters; a catalog fallback is a hold, not a final charge." };
  }
  if (money(usd) && ["per_call", "per_success"].includes(cost.type)) {
    // Unit rates for results, seconds or other quantities require separate usage assumptions.
    if (cost.unit && !["call", "request"].includes(cost.unit)) return { ...base, kind: "variable",
      note: cost.note || `Pricing is per ${cost.unit}; calls alone do not establish usage.` };
    return { ...base, kind: "exact", minUsd: usd, maxUsd: usd, note: cost.note || "Flat catalog rate; assumes every planned call is billed." };
  }
  return base;
}

function priceLabel(kind, minUsd, maxUsd) {
  if (kind === "exact") return formatUsd(minUsd);
  if (kind === "range") return `${formatUsd(minUsd)} to ${formatUsd(maxUsd)}`;
  if (kind === "starting") return minUsd === 0 ? "Variable cost" : `Starting at ${formatUsd(minUsd)}`;
  if (kind === "human") return "Human time not priced";
  if (kind === "variable") return "Variable / account pricing";
  return "Unknown price";
}

export function estimateStepCost(step, runs = 1, peoplePerRun = 1) {
  const unitQuantity = positiveInteger(step.quantity);
  const quantity = unitQuantity * (step.perContact ? positiveInteger(peoplePerRun) : 1);
  runs = positiveInteger(runs);
  const externalNote = step.kind === "gmail" ? "Gmail account limits apply. No Treg price is listed for reading a mailbox."
    : step.kind === "skill" ? "Runs in your agent. Model or local computing costs depend on your setup." : null;
  const price = step.endpointId ? catalogCost(step.catalog) : externalNote ? {
    kind: "variable", minUsd: null, maxUsd: null, note: externalNote,
  } : {
    kind: "human", minUsd: null, maxUsd: null, note: "Human time is excluded from tool cost totals.", sourceUrl: null, checked: null,
  };
  const scale = quantity * runs;
  const minUsd = money(price.minUsd) && Number.isFinite(price.minUsd * scale) ? price.minUsd * scale : null;
  const maxUsd = money(price.maxUsd) && Number.isFinite(price.maxUsd * scale) ? price.maxUsd * scale : null;
  const kind = price.kind === "exact" && minUsd === null ? "unknown" : price.kind;
  return { ...price, kind, minUsd, maxUsd, unitQuantity, quantity, runs, label: priceLabel(kind, minUsd, maxUsd) };
}

export function estimateRecipeCost(recipe, runs = recipe.runs) {
  runs = positiveInteger(runs);
  const steps = (recipe.steps || []).map((step) => estimateStepCost(step, runs, recipe.peoplePerRun));
  const humanSteps = steps.filter((step) => step.kind === "human").length;
  const tools = steps.filter((step) => step.kind !== "human");
  const priced = tools.filter((step) => money(step.minUsd));
  const excludedSteps = tools.length - priced.length;
  const sum = (field) => priced.reduce((total, step) => total + step[field], 0);
  const minUsd = priced.length ? sum("minUsd") : null;
  const maxUsd = priced.length && !excludedSteps && priced.every((step) => money(step.maxUsd)) ? sum("maxUsd") : null;
  let kind = !tools.length ? "human" : !priced.length ? "unknown" : excludedSteps ? "partial"
    : maxUsd === null ? "starting" : minUsd === maxUsd ? "exact" : "range";
  let label = kind === "partial" ? `${priced.some((step) => step.kind !== "exact") ? "Starting at " : ""}${formatUsd(minUsd)} known subtotal + ${excludedSteps} unpriced step${excludedSteps === 1 ? "" : "s"}`
    : priceLabel(kind, minUsd, maxUsd);
  if (kind === "partial" && minUsd === 0) label = `Variable cost · ${excludedSteps} unpriced step${excludedSteps === 1 ? "" : "s"}`;
  if (tools.length && !(recipe.steps || []).some(step => step.endpointId)) label = "No Treg calls";
  const note = "Planning estimate from inspected public catalog metadata. Quantities are calls per run; each planned call is assumed billable, and success-priced rates assume a chargeable result. No retries, extra usage, taxes, account subscriptions or human time are included. Starting prices and ranges are not quotes; unknown costs are excluded, never treated as free.";
  return { kind, minUsd, maxUsd, label, steps, excludedSteps, humanSteps, runs, note };
}

// Summarize the current order so a swap, insertion or deletion changes both handoffs.
export function recipeTldr(recipe) {
  if (!recipe.steps?.length) return recipe.gaps?.[0] || "Add a step to describe the path.";
  const short = text => String(text || "").trim().replace(/[.!?]+$/, "");
  const actions = recipe.steps.filter(step => step.endpointId || ["gmail", "skill"].includes(step.kind));
  const names = (actions.length ? actions : recipe.steps).map(step => short(step.title)).filter(Boolean);
  const sentenceCase = text => text.replace(/^[A-Z](?=[a-z])/, first => first.toLowerCase());
  const path = names.map(sentenceCase);
  const sequence = path.length > 1 ? `${path.slice(0, -1).join(", ")}, then ${path.at(-1)}` : path[0];
  const owner = actions.length ? "Your agent will" : "You will";
  const output = short(recipe.steps.at(-1)?.output);
  const last = recipe.steps.at(-1);
  const review = actions.length && !last.endpointId && (!last.kind || last.kind === "human") ? "You review the result." : "";
  return [sequence ? `${owner} ${sequence}.` : "", review,
    output ? `The result: ${sentenceCase(output)}.` : ""].filter(Boolean).join(" ");
}

export function recipeMarkdown(recipe) {
  const estimate = estimateRecipeCost(recipe);
  const perRun = estimateRecipeCost(recipe, 1);
  const connections = [];
  if (recipe.steps.some(step => step.kind === "gmail")) connections.push("- In your agent, connect the Gmail account the user chooses with read-only access. Confirm the search scope before reading conversations.");
  if (recipe.steps.some(step => step.endpointId)) connections.push("- Connect the intended Treg account in your agent. Check access, required inputs and current provider pricing for the selected endpoints before making calls.");
  if (recipe.steps.some(step => step.kind === "skill")) connections.push("- Load the linked qualification skill in the executing agent. Keep contact-level evidence in the user's own environment.");
  const lines = [`# ${recipe.title}`, "", "## Handoff to your coding agent",
    "Use the edited steps below. Resolve open questions with the user and confirm the scope of any account access or paid calls before execution.",
    ...(recipe.goal ? [`Goal: ${recipe.goal}`] : []), ...(recipe.audience ? [`Audience and inputs: ${recipe.audience}`] : []),
    "", ...connections, "", "## Planning assumptions", ...(recipe.mode === "catalog" ? [recipe.source === "gmail" ? "The plan was prepared without accessing Gmail or querying the catalog." : "The planner used public catalog metadata."] : []), `Runs: ${estimate.runs}`, ...(recipe.peoplePerRun ? [`People per run: ${recipe.peoplePerRun}`] : []),
    `Tool cost per run: ${perRun.label}`, `Tool cost for ${estimate.runs} run(s): ${estimate.label}`,
    `Human steps: ${estimate.humanSteps}; human time is not priced.`, estimate.note,
    "No catalog tools were executed by this planner.", "", ...(recipe.assumptions || []).map((item) => `- ${item}`),
    ...recipe.steps.flatMap((step, index) => {
      const cost = estimate.steps[index];
      return [`## ${index + 1}. ${step.title}`,
        step.endpointId ? `Tool: ${step.endpointId} (${catalogEndpointUrl(step.endpointId)})` : step.kind === "gmail" ? "Connector: Gmail (read-only, in your own account)"
          : step.kind === "skill" ? `Agent skill: ${step.skillId} (${step.skillUrl})` : "Tool: Human decision",
        `Quantity per run: ${cost.quantity}${step.endpointId ? " calls" : step.kind === "gmail" || step.kind === "skill" ? " steps" : " human actions"}${step.perContact ? ` (${cost.unitQuantity} per person)` : ""}`,
        `Cost per run: ${estimateStepCost(step, 1, recipe.peoplePerRun).label}`, `Cost for ${estimate.runs} run(s): ${cost.label}`,
        `Cost assumption: ${cost.note}`,
        ...(cost.sourceUrl ? [`Pricing source: ${cost.sourceUrl}${cost.checked ? ` (checked ${cost.checked})` : ""}`] : []),
        `Why: ${step.why}`, `Input: ${step.input}`, `Output: ${step.output}`, "", step.instructions,
        ...((step.alternatives || []).length ? ["", "Alternatives:", ...step.alternatives.map((item) => `- ${item.endpointId} (${catalogEndpointUrl(item.endpointId)}): ${item.why}`)] : []), ""];
    }), ...((recipe.gaps || []).length ? ["## Open questions", ...recipe.gaps.map((gap) => `- ${gap}`)] : [])];
  return lines.join("\n");
}

export function cleanRecipe(value, endpointDetails) {
  if (!value || typeof value.title !== "string" || !Array.isArray(value.steps) || !Array.isArray(value.gaps)) {
    throw new Error("The planner returned an invalid recipe.");
  }
  const steps = value.steps.slice(0, MAX_STEPS).map((step) => {
    if (!step || typeof step.title !== "string" || typeof step.instructions !== "string" ||
      typeof step.why !== "string" || typeof step.input !== "string" || typeof step.output !== "string" ||
      !Array.isArray(step.alternatives)) throw new Error("The planner returned an invalid recipe step.");
    const valid = (id) => typeof id === "string" && endpointDetails.has(id);
    if (step.endpointId !== null && !valid(step.endpointId)) throw new Error("The planner selected an endpoint outside the live catalog results.");
    if (step.endpointId === null && !step.why.trim()) throw new Error("Human decision steps need an explanation.");
    const alternatives = step.alternatives.filter((item) => item && valid(item.endpointId) &&
      typeof item.why === "string" && typeof item.input === "string" && typeof item.output === "string").slice(0, 3);
    const pricingSnapshot = (id) => {
      const inspected = endpointDetails.get(id);
      if (!inspected) return null;
      const snapshot = { id, cost: inspected.cost ?? null };
      for (const key of ["routing", "capability", "docsUrl", "requiredInputs", "inputFields", "outputFields", "inputNote", "producesEmail", "needsEmail"]) {
        if (inspected[key] != null) snapshot[key] = inspected[key];
      }
      return snapshot;
    };
    return {
      kind: step.endpointId ? "treg" : "human",
      ...(step.perContact === true ? { perContact: true } : {}),
      ...(step.endpointId === null && step.kind === "gmail" ? { kind: "gmail" } : {}),
      ...(step.endpointId === null && step.kind === "skill" && step.skillId === "qualify-warm-contacts" ? {
        kind: "skill", skillId: step.skillId, skillUrl: "https://github.com/ragnos-dev/treg-kitchen/blob/main/skills/qualify-warm-contacts/SKILL.md",
      } : {}),
      catalog: step.endpointId ? pricingSnapshot(step.endpointId) : null,
      quantity: positiveInteger(step.quantity),
      title: step.title.slice(0, 120), instructions: step.instructions.slice(0, 1000),
      endpointId: step.endpointId, why: step.why.slice(0, 500), input: step.input.slice(0, 400),
      output: step.output.slice(0, 400), endpointUrl: step.endpointId ? catalogEndpointUrl(step.endpointId) : null,
      alternatives: alternatives.map(({ endpointId, why, input, output }) => ({ endpointId, why: why.slice(0, 500), input: input.slice(0, 400), output: output.slice(0, 400), catalog: pricingSnapshot(endpointId), endpointUrl: catalogEndpointUrl(endpointId) })),
    };
  });
  const gaps = [...new Set(value.gaps.filter((gap) => typeof gap === "string" && gap.trim()).map((gap) => gap.slice(0, 500)))].slice(0, 8);
  if (!steps.length && !gaps.length) throw new Error("The planner could not build any recipe steps.");
  return { title: value.title.slice(0, 160), runs: positiveInteger(value.runs), steps, gaps };
}

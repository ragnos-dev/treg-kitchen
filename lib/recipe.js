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
  if (kind === "starting") return `Starting at ${formatUsd(minUsd)}`;
  if (kind === "human") return "Human time not priced";
  if (kind === "variable") return "Variable / account pricing";
  return "Unknown price";
}

export function estimateStepCost(step, runs = 1) {
  const quantity = positiveInteger(step.quantity);
  runs = positiveInteger(runs);
  const price = step.endpointId ? catalogCost(step.catalog) : {
    kind: "human", minUsd: null, maxUsd: null, note: "Human time is excluded from tool cost totals.", sourceUrl: null, checked: null,
  };
  const scale = quantity * runs;
  const minUsd = money(price.minUsd) && Number.isFinite(price.minUsd * scale) ? price.minUsd * scale : null;
  const maxUsd = money(price.maxUsd) && Number.isFinite(price.maxUsd * scale) ? price.maxUsd * scale : null;
  const kind = price.kind === "exact" && minUsd === null ? "unknown" : price.kind;
  return { ...price, kind, minUsd, maxUsd, quantity, runs, label: priceLabel(kind, minUsd, maxUsd) };
}

export function estimateRecipeCost(recipe, runs = recipe.runs) {
  runs = positiveInteger(runs);
  const steps = (recipe.steps || []).map((step) => estimateStepCost(step, runs));
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
  const note = "Planning estimate from inspected public catalog metadata. Quantities are calls per run; each planned call is assumed billable, and success-priced rates assume a chargeable result. No retries, extra usage, taxes, account subscriptions or human time are included. Starting prices and ranges are not quotes; unknown costs are excluded, never treated as free.";
  return { kind, minUsd, maxUsd, label, steps, excludedSteps, humanSteps, runs, note };
}

export function recipeMarkdown(recipe) {
  const estimate = estimateRecipeCost(recipe);
  const perRun = estimateRecipeCost(recipe, 1);
  const lines = [`# ${recipe.title}`, "", "## Planning assumptions", ...(recipe.mode === "catalog" ? ["Drafted from catalog matches without a planning model."] : []), `Runs: ${estimate.runs}`,
    `Tool cost per run: ${perRun.label}`, `Tool cost for ${estimate.runs} run(s): ${estimate.label}`,
    `Human steps: ${estimate.humanSteps}; human time is not priced.`, estimate.note,
    "No catalog tools were executed by this planner.", "", ...(recipe.assumptions || []).map((item) => `- ${item}`),
    ...recipe.steps.flatMap((step, index) => {
      const cost = estimate.steps[index];
      return [`## ${index + 1}. ${step.title}`,
        step.endpointId ? `Tool: ${step.endpointId} (${catalogEndpointUrl(step.endpointId)})` : "Tool: Human decision",
        `Quantity per run: ${cost.quantity}${step.endpointId ? " calls" : " human actions"}`,
        `Cost per run: ${estimateStepCost(step).label}`, `Cost for ${estimate.runs} run(s): ${cost.label}`,
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
      return inspected ? { id, cost: inspected.cost ?? null } : null;
    };
    return {
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

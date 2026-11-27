export const MAX_STEPS = 6;

export function catalogEndpointUrl(endpointId) {
  return `https://treg.to/catalog/endpoints/${encodeURIComponent(endpointId)}`;
}

export function recipeMarkdown(recipe) {
  const lines = [`# ${recipe.title}`, "", ...recipe.steps.flatMap((step, index) => [
    `## ${index + 1}. ${step.title}`,
    step.endpointId ? `Tool: ${step.endpointId} (${catalogEndpointUrl(step.endpointId)})` : "Tool: Human decision",
    `Why: ${step.why}`,
    `Input: ${step.input}`,
    `Output: ${step.output}`,
    "",
    step.instructions,
    ...(step.alternatives.length ? ["", "Alternatives:", ...step.alternatives.map((item) => `- ${item.endpointId} (${catalogEndpointUrl(item.endpointId)}): ${item.why}`)] : []),
    "",
  ]), ...(recipe.gaps.length ? ["## Open questions", ...recipe.gaps.map((gap) => `- ${gap}`)] : [])];
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
    return {
      title: step.title.slice(0, 120), instructions: step.instructions.slice(0, 1000),
      endpointId: step.endpointId, why: step.why.slice(0, 500), input: step.input.slice(0, 400),
      output: step.output.slice(0, 400), endpointUrl: step.endpointId ? catalogEndpointUrl(step.endpointId) : null,
      alternatives: alternatives.map((item) => ({ ...item, endpointUrl: catalogEndpointUrl(item.endpointId) })),
    };
  });
  const gaps = [...new Set(value.gaps.filter((gap) => typeof gap === "string" && gap.trim()).map((gap) => gap.slice(0, 500)))].slice(0, 8);
  if (!steps.length && !gaps.length) throw new Error("The planner could not build any recipe steps.");
  return { title: value.title.slice(0, 160), steps, gaps };
}

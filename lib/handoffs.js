// Only check dependencies declared by the composer. Supplied files and other
// external prerequisites are recorded in the recipe's input brief and gaps.
export function dependencyGaps(steps) {
  const available = new Set();
  const gaps = [];
  for (const [index, step] of steps.entries()) {
    const missing = (step.requires || []).filter(input => !available.has(input));
    if (missing.length) gaps.push(`[Handoff] Step ${index + 1} (${step.title}) needs ${missing.join(", ")} from an earlier step.`);
    if (step.kind !== "blocked" && !missing.length) for (const output of step.provides || []) available.add(output);
  }
  return gaps;
}

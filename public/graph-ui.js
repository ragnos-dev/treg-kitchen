import { createAnimatedBeam } from "./vendor/21st-animated-beam.js";
/** Editable recipe map. Text remains DOM content so every step is keyboard reachable. */
export function createRecipeGraph(host, { select, insert }) {
  let selected = 0;
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  function beam(connection) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 100 65");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");
    svg.classList.add("handoff-beam");
    svg.append(
      createAnimatedBeam({
        from: { x: 50, y: 0 },
        to: { x: 50, y: 65 },
        axis: "y",
        pathColor: "#73726c",
        pathWidth: 0.35,
        pathOpacity: 0.6,
        gradientStartColor: "#b53c2c",
        gradientStopColor: "#d5a16c",
        duration: 1.1,
      }),
    );
    connection.prepend(svg);
  }
  function kind(step) {
    if (step.kind === "gmail") return ["teal", "Gmail history"];
    if (step.kind === "skill") return ["coral", "Agent skill"];
    if (!step.endpointId) return ["pink", "Human decision"];
    if (/verif|check|valid/i.test(`${step.title} ${step.endpointId}`)) return ["amber", "Verification"];
    return ["teal", "Treg tool"];
  }
  function draw(recipe, active = selected) {
    selected = Math.max(0, Math.min(active, recipe.steps.length - 1));
    host.replaceChildren();
    const legend = el("div", "graph-legend");
    [
      ["teal", "Source / tool"],
      ["coral", "Agent work"],
      ["pink", "Human decision"],
      ["amber", "Check"],
    ].forEach(([color, label]) => {
      const n = el("span", `legend-${color}`, label);
      legend.append(n);
    });
    host.append(legend);
    const flow = el("ol", "graph-flow");
    flow.setAttribute("aria-label", "Recipe sequence. Choose a step to inspect and edit.");
    flow.setAttribute("role", "list");
    const start = el("li", "graph-terminal", "Your brief & inputs");
    flow.append(start);
    recipe.steps.forEach((step, index) => {
      const connector = el("li", "graph-connection");
      connector.append(
        el(
          "span",
          "handoff-label",
          index
            ? recipe.steps[index - 1].output || "Previous step’s result"
            : "Audience, goal & available input",
        ),
      );
      const add = el("button", "connection-add", "+");
      add.type = "button";
      add.setAttribute("aria-label", `Add a step before step ${index + 1}`);
      add.title = "Add a step here";
      add.addEventListener("click", () => insert(index, add));
      connector.append(add);
      beam(connector);
      flow.append(connector);
      const row = el("li", "graph-row");
      const [color, label] = kind(step);
      const node = el(
        "button",
        `graph-node graph-${color}${!step.endpointId && step.kind !== "gmail" && step.kind !== "skill" ? " graph-decision" : ""}`,
      );
      node.type = "button";
      node.dataset.node = index;
      node.setAttribute("aria-pressed", String(index === selected));
      node.setAttribute("aria-controls", "step-inspector");
      node.append(
        el("span", "node-type", `${String(index + 1).padStart(2, "0")} · ${label}`),
        el("strong", "node-title", step.title),
        el(
          "span",
          "node-subtitle",
          step.endpointId ||
            (step.kind === "gmail"
              ? "Your agent connects Gmail"
              : step.kind === "skill"
                ? "Uses your agent"
                : "You choose what moves forward"),
        ),
      );
      node.addEventListener("click", () => {
        selected = index;
        select(index);
      });
      row.append(node);
      if (step.alternatives?.length) {
        const branch = el("div", "graph-branch");
        branch.append(
          el("span", "branch-condition", "If input or provider differs"),
          el(
            "span",
            "branch-node",
            `${step.alternatives[0].endpointId}${step.alternatives.length > 1 ? ` + ${step.alternatives.length - 1} more` : ""}`,
          ),
        );
        const view = el("button", "branch-view", "Inspect options");
        view.type = "button";
        view.addEventListener("click", () => {
          selected = index;
          select(index, true);
        });
        branch.append(view);
        row.append(branch);
      }
      flow.append(row);
    });
    const end = el("li", "graph-connection");
    end.append(el("span", "handoff-label", recipe.steps.at(-1)?.output || "Reviewed result"));
    const add = el("button", "connection-add", "+");
    add.type = "button";
    add.setAttribute("aria-label", "Add a final step");
    add.addEventListener("click", () => insert(recipe.steps.length, add));
    end.append(add);
    beam(end);
    flow.append(end, el("li", "graph-terminal", "Ready for your agent"));
    host.append(flow);
  }
  return { draw };
}

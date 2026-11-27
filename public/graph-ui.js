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
  let dismissTrace = () => {};
  document.addEventListener("pointerdown", (event) => {
    if (!host.contains(event.target) || !event.target.closest(".handoff-trigger")) dismissTrace();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") dismissTrace();
  });

  function beam(trigger) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 36 80");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");
    svg.classList.add("handoff-beam");
    svg.append(createAnimatedBeam({
      d: "M 18 0 C 18 22, 9 24, 9 40 S 18 61, 18 80",
      axis: "y",
      pathColor: "currentColor",
      pathWidth: 2,
      pathOpacity: 0.75,
      gradientStartColor: "#ad3728",
      gradientStopColor: "#ffb45f",
      duration: 0.9,
      manual: true,
    }));
    trigger.prepend(svg);
    return () => {
      if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
        svg.querySelectorAll("animate").forEach((animation) => animation.beginElement());
      }
    };
  }

  function connection(recipe, index) {
    const previous = recipe.steps[index - 1];
    const next = recipe.steps[index];
    const source = previous?.title || "Your brief";
    const destination = next?.title || "Ready for your agent";
    const output = previous?.output || (previous ? "Previous step’s result" : "Audience, goal & available input");
    const item = el("li", "graph-connection");
    const trigger = el("button", "handoff-trigger");
    trigger.type = "button";
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-label", `Trace handoff from ${source} to ${destination}: ${output}`);
    const pulse = beam(trigger);
    trigger.append(el("span", "handoff-label", output));
    const preview = el("span", "handoff-preview");
    preview.id = `handoff-preview-${index}`;
    trigger.setAttribute("aria-controls", preview.id);
    preview.hidden = true;
    preview.append(
      el("span", "handoff-from", `From ${source}`),
      el("strong", "handoff-to", next ? `Step ${index + 1} · ${destination}` : destination),
      el("span", "handoff-input", `Passes: ${output}`),
      ...(next?.input ? [el("span", "handoff-input", `Needs: ${next.input}`)] : []),
    );
    trigger.append(preview);
    const show = () => {
      if (!preview.hidden) return;
      dismissTrace();
      preview.hidden = false;
      item.classList.add("tracing");
      trigger.setAttribute("aria-expanded", "true");
      const ends = [index - 1, index].map(i => host.querySelector(`[data-node="${i}"]`)).filter(Boolean);
      ends.forEach(node => node.classList.add("trace-end"));
      pulse();
      dismissTrace = () => {
        preview.hidden = true;
        item.classList.remove("tracing");
        trigger.setAttribute("aria-expanded", "false");
        ends.forEach(node => node.classList.remove("trace-end"));
        dismissTrace = () => {};
      };
    };
    trigger.addEventListener("pointerenter", event => { if (event.pointerType !== "touch") show(); });
    trigger.addEventListener("pointerleave", () => {
      if (!preview.hidden && document.activeElement !== trigger) dismissTrace();
    });
    trigger.addEventListener("focus", show);
    trigger.addEventListener("click", show);
    trigger.addEventListener("blur", () => { if (!preview.hidden) dismissTrace(); });

    const add = el("button", "connection-add", "+");
    add.type = "button";
    add.setAttribute("aria-label", next ? `Add a step before step ${index + 1}` : "Add a final step");
    add.title = "Add a step here";
    add.addEventListener("click", () => insert(index, add));
    item.append(trigger, add);
    return item;
  }
  function kind(step) {
    if (step.kind === "gmail") return ["teal", "Gmail history"];
    if (step.kind === "skill") return ["coral", "Agent skill"];
    if (!step.endpointId) return ["pink", "Human decision"];
    if (/verif|valid/i.test(step.endpointId)) return ["amber", "Treg verification"];
    return ["teal", "Treg tool"];
  }
  function draw(recipe, active = selected) {
    selected = Math.max(0, Math.min(active, recipe.steps.length - 1));
    dismissTrace();
    host.replaceChildren();
    const flow = el("ol", "graph-flow");
    flow.setAttribute("aria-label", "Recipe sequence. Choose a step to inspect and edit.");
    flow.setAttribute("role", "list");
    const start = el("li", "graph-terminal", "Your brief & inputs");
    flow.append(start);
    recipe.steps.forEach((step, index) => {
      flow.append(connection(recipe, index));
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
      const mark = el("span", "node-mark");
      mark.setAttribute("aria-hidden", "true");
      if (step.kind === "gmail" || step.endpointId) {
        const logo = el("img");
        logo.src = step.kind === "gmail" ? "/marks/gmail.png" : "/marks/treg.svg";
        logo.alt = "";
        mark.append(logo);
      } else {
        mark.textContent = step.kind === "skill" ? "{}" : "◇";
      }
      const name = el("span", "node-copy");
      name.append(
        el("span", "node-type", `${String(index + 1).padStart(2, "0")} · ${label}`),
        el("strong", "node-title", step.title),
      );
      node.append(mark, name);
      node.addEventListener("click", () => {
        selected = index;
        select(index);
      });
      row.append(node);
      if (step.alternatives?.length) {
        const branch = el("div", "graph-branch");
        const view = el("button", "branch-view", `Inspect ${step.alternatives.length} alternative${step.alternatives.length === 1 ? "" : "s"}`);
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
    flow.append(connection(recipe, recipe.steps.length), el("li", "graph-terminal", "Ready for your agent"));
    host.append(flow);
  }
  return { draw };
}

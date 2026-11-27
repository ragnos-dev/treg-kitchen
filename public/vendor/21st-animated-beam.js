/**
 * Animated Beam by dillionverma (Magic UI), 21st.dev item 919.
 * https://21st.dev/@dillionverma/components/animated-beam
 * Retrieved 2026-11-27. Original: vendor/21st-animated-beam/animated-beam.original.tsx.
 * Adapted from actual source: native DOM/SVG replaces React/framer-motion;
 * caller supplies geometry, local tokens, finite pulse and reduced motion.
 */
const NS = "http://www.w3.org/2000/svg";
let sequence = 0;

function element(name, attributes) {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

/** Creates a decorative connector. The caller appends the returned group. */
export function createAnimatedBeam({
  from = { x: 0, y: 0 },
  to = { x: 100, y: 0 },
  curvature = 0,
  d,
  reverse = false,
  pathColor = "#b8beb7",
  pathWidth = 2,
  pathOpacity = 0.55,
  gradientStartColor = "#7c9c66",
  gradientStopColor = "#c5d78c",
  duration = 1.2,
  delay = 0,
  animate = true,
  axis = "x",
} = {}) {
  const id = `kitchen-beam-${++sequence}`;
  const pathD = d ?? `M ${from.x},${from.y} Q ${(from.x + to.x) / 2},${from.y - curvature} ${to.x},${to.y}`;
  const group = element("g", { "aria-hidden": "true", "pointer-events": "none", class: "recipe-beam" });
  group.append(
    element("path", {
      d: pathD,
      fill: "none",
      stroke: pathColor,
      "stroke-width": pathWidth,
      "stroke-opacity": pathOpacity,
      "stroke-linecap": "round",
    }),
  );
  const reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (!animate || reducedMotion) return group;
  const defs = element("defs", {});
  const gradient = element("linearGradient", {
    id,
    gradientUnits: "userSpaceOnUse",
    x1: "0%",
    x2: "0%",
    y1: "0%",
    y2: "0%",
  });
  // Four stops and directional travel are preserved from the retrieved source.
  for (const [offset, color, opacity] of [
    ["0%", gradientStartColor, 0],
    ["0%", gradientStartColor, 1],
    ["32.5%", gradientStopColor, 1],
    ["100%", gradientStopColor, 0],
  ])
    gradient.append(element("stop", { offset, "stop-color": color, "stop-opacity": opacity }));
  const coordinates = reverse
    ? { x1: ["90%", "-10%"], x2: ["100%", "0%"] }
    : { x1: ["10%", "110%"], x2: ["0%", "100%"] };
  for (const [attributeName, values] of Object.entries(coordinates)) {
    gradient.append(
      element("animate", {
        attributeName: axis === "y" ? attributeName.replace("x", "y") : attributeName,
        values: values.join(";"),
        dur: `${duration}s`,
        begin: `${delay}s`,
        repeatCount: 1,
        fill: "remove",
        calcMode: "spline",
        keyTimes: "0;1",
        keySplines: "0.16 1 0.3 1",
      }),
    );
  }
  defs.append(gradient);
  group.append(
    defs,
    element("path", {
      d: pathD,
      fill: "none",
      stroke: `url(#${id})`,
      "stroke-width": pathWidth,
      "stroke-opacity": 1,
      "stroke-linecap": "round",
    }),
  );
  return group;
}

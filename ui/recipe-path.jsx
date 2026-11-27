import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Stepper, StepperItem, StepperIndicator, StepperTrigger } from "../vendor/21st-origin-ui/stepper";
import { Popover, PopoverTrigger, PopoverContent } from "../vendor/21st-origin-ui/popover";
import { FileText, UserRound, Braces, Wrench, CircleAlert } from "lucide-react";
import { createAnimatedBeam } from "../public/vendor/21st-animated-beam.js";
import { estimateStepCost } from "../lib/recipe.js";

function identity(step, index) {
  if (step.endpointId) return ["Treg", <img src="/marks/treg.svg" alt="" />];
  if (step.kind === "gmail") return ["Gmail", <img src="/marks/gmail.png" alt="" />];
  if (step.kind === "skill") return ["Skill", <Braces aria-hidden="true" />];
  if (step.kind === "custom") return [step.resourceName, step.resourceKind === "skill"
    ? <Braces aria-hidden="true" /> : <Wrench aria-hidden="true" />];
  if (step.kind === "blocked") return ["Needed", <CircleAlert aria-hidden="true" />];
  return index === 0 ? ["Brief", <FileText />] : ["Review", <UserRound />];
}

function Connection({ previous, next, trace, setTrace, index, missing }) {
  const svg = useRef(null);
  useEffect(() => {
    const group = createAnimatedBeam({ from: {x: 0,y: 8}, to: {x: 80,y: 8}, manual: true, pathWidth: 2,
      pathColor: "currentColor", gradientStartColor: "#ac3324", gradientStopColor: "#f7af6a" });
    svg.current.replaceChildren(group);
    return () => group.remove();
  }, []);
  const show = () => {
    if (trace !== index && !matchMedia("(prefers-reduced-motion: reduce)").matches)
      svg.current.querySelectorAll("animate").forEach(animation => animation.beginElement());
    setTrace(index);
  };
  return <button type="button" className="path-wire" data-missing={missing || undefined}
    aria-label={`${missing ? "Missing input. " : ""}Trace ${previous.title} to ${next.title}`}
    aria-expanded={trace === index} onPointerEnter={e => { if (e.pointerType !== "touch") show(); }}
    onPointerLeave={e => { if (document.activeElement !== e.currentTarget) setTrace(null); }}
    onFocus={show} onBlur={() => setTrace(null)} onClick={show}
    onKeyDown={e => { if (e.key === "Escape") setTrace(null); }}>
    <svg ref={svg} viewBox="0 0 80 16" preserveAspectRatio="none" aria-hidden="true" />
    {missing && <CircleAlert className="path-wire-alert" aria-hidden="true" />}
  </button>;
}

function Path({ recipe, select, insert }) {
  const [open, setOpen] = useState(null);
  const moveFocus = useRef(false);
  const [trace, setTrace] = useState(null);
  const steps = recipe.steps;
  const traced = steps[trace];
  const missing = new Map();
  for (const gap of recipe.gaps || []) {
    const match = gap.match(/^\[Handoff\] (Step (\d+).*)$/);
    if (match) missing.set(Number(match[2]) - 1, match[1]);
  }
  return <>
    <div className="path-heading"><h2>Recipe path</h2><button className="path-action" onClick={() => insert(steps.length)}>Add step</button></div>
    <div className="path-scroll">
      <Stepper className="path-track" value={open ?? -1} onValueChange={setOpen} aria-label="Recipe steps">
        {steps.map((step, i) => {
          const [label, mark] = identity(step, i);
          return <StepperItem key={i} step={i} className="path-stop">
            <Popover open={open === i} onOpenChange={expanded => {setTrace(null);setOpen(expanded ? i : null);}}>
              <PopoverTrigger asChild>
                <StepperTrigger type="button" className="path-node" data-node={i} data-kind={step.kind}
                  aria-label={`Step ${i + 1}. ${step.title}${step.kind === "custom" ? `. Custom ${step.resourceKind}: ${label}` : ""}${step.kind === "blocked" || missing.has(i) ? ". Input needed" : ""}`}>
                  <StepperIndicator asChild className="path-mark">{mark}</StepperIndicator>
                  <span>{label}{(step.kind === "custom" || missing.has(i)) && <small>{missing.has(i) ? "Input needed" : `Custom ${step.resourceKind}`}</small>}</span>
                </StepperTrigger>
              </PopoverTrigger>
              <PopoverContent className="path-popover" side="bottom" align="center" sideOffset={9} collisionPadding={12}
                aria-label={step.title} onCloseAutoFocus={event => { if (moveFocus.current) {event.preventDefault(); moveFocus.current = false;} }} onOpenAutoFocus={event => event.preventDefault()}>
                <div className="path-kicker">Step {i + 1} of {steps.length} · {label}</div>
                <h3>{step.title}</h3><p>{step.why}</p>
                <dl><dt>Needs</dt><dd>{step.input}</dd><dt>Returns</dt><dd>{step.output}</dd>
                  {step.evidence && <><dt>Accept when</dt><dd>{step.evidence}</dd></>}
                </dl>
                {missing.has(i) && <p className="path-missing">{missing.get(i)}</p>}
                {step.kind === "blocked" && <p className="path-missing">Supply this dependency in your agent before continuing.</p>}
                {step.kind === "custom" && <p className="path-source">{step.resourceSource
                  ? <>Source to verify in your agent: {step.resourceSource}</>
                  : <>Supply this {step.resourceKind} in your agent.</>}</p>}
                {step.endpointId && <div className="path-source"><a href={step.endpointUrl} target="_blank" rel="noreferrer">{step.endpointId}</a><span>{estimateStepCost(step, 1, recipe.peoplePerRun).label}</span></div>}
                {step.skillUrl && <a href={step.skillUrl} target="_blank" rel="noreferrer">{step.skillId}</a>}
                <div className="path-options"><button onClick={() => {moveFocus.current = true; setOpen(null); select(i);}}>Edit step</button>
                  <button onClick={() => {moveFocus.current = true; setOpen(null); insert(i);}}>Insert before</button></div>
              </PopoverContent>
            </Popover>
            {i + 1 < steps.length && <Connection index={i} previous={step} next={steps[i+1]} missing={missing.has(i + 1)} trace={trace} setTrace={value=>{setTrace(value);if(value !== null)setOpen(null);}}/>}
          </StepperItem>;
        })}
      </Stepper>
    </div>
    {trace !== null && traced && steps[trace+1] && <div className="path-transfer" role="status">
      <strong>{identity(traced,trace)[0]} to {identity(steps[trace+1],trace+1)[0]}</strong><p>{traced.output}</p><small>Next step needs {steps[trace+1].input}</small>
      {missing.has(trace + 1) && <p className="path-missing">{missing.get(trace + 1)}</p>}</div>}
  </>;
}

export function createRecipeGraph(host, actions) {
  const root = createRoot(host);
  let previous, revision = 0;
  return { draw(recipe) {
    if (previous !== recipe) {revision++; previous = recipe;}
    root.render(<Path key={revision} recipe={recipe} {...actions} />);
  }};
}

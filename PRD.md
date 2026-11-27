# Treg Kitchen product requirements

Treg Kitchen is an open-source recipe generator for people who know the outcome they want and need help choosing how to get it. A person describes a job and what they already have. Kitchen shows the proposed path, explains the choices, and gives them instructions their own coding agent can follow. Success means they can answer three questions before running anything. Why these steps? What passes between them? What will the result and likely cost be?

## Who uses it

- A person planning a workflow uses a single web page to explore a goal, compare tools and edit the recipe. They can start without a Treg account or knowledge of endpoint names.
- A coding-agent user can paste the open-source planning skill into their own environment or generate a recipe headlessly. The agent that eventually runs the recipe uses that person's connections, permissions and spending decisions.

The recipe can draw from Treg endpoints, RAGnos tools and published methods, and tools or skills the user supplies. The capability index helps discover and compare candidates. Live catalog records are the source for the Treg inputs, routing and prices shown in a recipe.

## From a goal to a recipe

1. **Ask what changes the path.** Start with the outcome and inputs the person has. Ask up to two short initial questions about missing facts that matter, such as whether they already have a URL, what evidence they will accept, or which sources they can use. Reuse details they supplied. If one fact remains essential, identify the affected step and draft the rest.
2. **Choose a method for each job.** Start discovery with Treg's free, anonymous public catalog search and endpoint inspection when a tool is needed. Use generic capability terms. Keep private material in the user's environment. Inspect compatible inputs, outputs, availability, routing and price before proposing a call. A custom tool or integration may supply data Treg cannot see, an open local skill may interpret it, and a person may need to decide whether the evidence is sufficient. A recipe can use any combination, including no Treg calls. For a proposed custom tool or skill, identify its documented source and prerequisites, or mark it as a dependency the user must supply.
3. **Show why the path works.** Each step names its purpose, who or what performs it, the input it needs, the output it promises and the evidence for accepting that output. Explain the selection and any viable alternative or fallback. Show the actual search terms and endpoints inspected in a compact planning log. For a routed Treg call, distinguish the endpoint selected by the planner from the providers that might serve it. Label an actual provider as known only if the executing agent has a receipt.
4. **Let the person change their mind.** The graph is the editor. Keep the whole path visible with compact, recognizable nodes and labeled connections. Selecting a node opens its real instructions, source and pricing details. Hovering, focusing or tapping a connection reveals what it carries. A restrained animated trace may follow that connection, with a static equivalent for reduced motion. Allow the person to edit, insert, substitute, reorder or remove steps. If an edit breaks a dependency, mark the missing input at that connection and offer a supported repair. Keep the same path usable on a phone and by keyboard.
5. **Price the edited plan.** Show estimated tool cost for one run and the chosen volume. Multiply the documented unit rate by planned calls, including per-item calls, and by runs. Preserve ranges, starting prices, account-dependent fees and unknowns. Label any known subtotal and unpriced work. The public demo has a $10 lifetime ceiling for model-assisted planning. The user's downstream calls have a separate estimate and require their own authorization.
6. **Give the person two outputs.** The human TL;DR names what goes in, what happens and what comes out. **Copy for my agent** gives the complete edited instructions, including connections to establish, ordered steps, evidence rules, quantities, cost assumptions and outstanding questions. Edits must update the graph, both outputs and the estimate together. **Copy skill** copies the full reusable planning method in one click, even before building a recipe. Publish the methods used by Kitchen in the repository so people can use them inline or headlessly.

The website's work ends at the handoff. It can read public catalog metadata and draft instructions. Connecting accounts, reading mailbox contents, running skills, contacting providers and authorizing paid calls belong in the executing agent. Keep the single-page sous-chef voice light and let the recipe take visual priority once it exists.

## Acceptance examples

These examples illustrate the required behavior across domains. Provider selection depends on the available inputs and current evidence.

| Given this request | What the recipe must do |
| --- | --- |
| “Find people I already know who fit this audience.” | Use authorized historical conversation evidence to establish a relationship. A local qualification skill assesses fit separately. Include public enrichment only if useful and compatible. End with a reviewable shortlist. |
| “Check this claim against the company page I supplied.” | Skip domain discovery. Inspect a page-reading candidate, pass the text and URL to an evidence check, and require a cited passage or an explicit unsupported result. If only a company name is supplied, resolve its identity first. |
| “Turn these recordings into a brief using my team's template.” | Account for the supplied recordings or transcripts and the local template. Inspect a transcription option only when needed. Identify how the brief will be produced and reviewed. Flag an unavailable tool, file or skill at the step that needs it. |

## What exists and what is open

The source includes catalog search and inspection, editable steps and alternatives, a graph inspector, volume estimates, Markdown and JSON CLI output, the copyable planner skill, and a warm-contact example combining Gmail, optional Treg enrichment, an open qualification skill and human review. A separate example describes a plan for checking a company claim. [Browser and CLI guide](README.md) · [Planner skill](SKILL.md) · [Company claim example](lib/example.js)

The ordinary browser form currently sends an audience brief and a fixed choice of Treg, Gmail or both. Its mixed-source planner specializes in contacts. The recipe format also recognizes one named qualification skill. The broader requirement is to select and validate compatible tools, integrations and skills per job across domains, with meaningful questions and quantity units for each. Which integrations to support next, how users identify their custom tools, and how those tools describe their contracts remain open. [Browser form](public/index.html) · [Request handler](api/recipe.js) · [Source planner](lib/source-planner.js) · [Recipe validation and export](lib/recipe.js)

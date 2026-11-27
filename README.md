# treg-kitchen

Describe what you want to make, the inputs you already have and any custom tools or skills your agent can use. Treg Kitchen builds an editable recipe with a human TL;DR, a cost estimate and instructions to copy into your agent. The website reads tool descriptions. Your files, accounts and tools stay in your own environment.

[Check a company claim](https://treg-kitchen.ragnos.io/?example=company-claim) · [Turn recordings into a brief](https://treg-kitchen.ragnos.io/?example=recordings-brief) · [Find warm contacts](https://treg-kitchen.ragnos.io/?example=warm-contacts)

Select a node for its rationale, inputs, outputs and source. Trace a connection to inspect the handoff. Use **Edit step** to revise the plan. **Add step** accepts a custom declaration or an exact public Treg endpoint ID. **Copy for my agent** copies the current instructions.

[Open treg-kitchen](https://treg-kitchen.ragnos.io) · [Product requirements and current coverage](PRD.md)

## Use the skill

Paste the full contents of [SKILL.md](SKILL.md) into an agent with public web access, or install it as a skill in your agent's supported format. The demo’s **Copy skill** button copies the same file. Use a generic description when searching the public catalog.

## Run headlessly or in a coding agent

Clone this repository and install with `npm ci` on Node 22. Run the same planner locally:

```sh
node bin/treg-kitchen.js --inputs "Company page URL: https://example.org/" "Check the claim that this domain is intended for documentation examples"

node bin/treg-kitchen.js --inputs "Two local recordings and our team template" \
  --resource '{"kind":"tool","name":"Team transcriber","input":"Recording file","output":"Timestamped transcript","source":"tools/transcriber.md"}' \
  "Turn the recordings into a brief using the team template"
```

The human TL;DR and agent handoff go to stdout as Markdown. Use `--format json` for another program, or pass a JSON planning request through `--stdin`. A Gmail-only plan works offline. Catalog paths use public metadata reads. Planning in the CLI requires no model credentials and never opens your mailbox. The exported handoff identifies the connections the executing agent needs. See the [Gmail step guide](docs/gmail.md) for the scope of a historical-contact search.

The MIT-licensed methods used by the app are in this repository:

| Skill | What it does |
| --- | --- |
| [treg-kitchen](SKILL.md) | Clarifies the goal, matches sources, checks handoffs and estimates run cost. Copy this file inline or install it in your coding agent. |
| [qualify-warm-contacts](skills/qualify-warm-contacts/SKILL.md) | Separates evidence of an existing relationship from evidence of buyer fit. |
| [check-source-evidence](skills/check-source-evidence/SKILL.md) | Grounds a claim in a specific passage or reports missing support. |
| [write-template-brief](skills/write-template-brief/SKILL.md) | Turns transcripts into a brief against the supplied template, with source references. |
| [draw-recipe-path](skills/draw-recipe-path/SKILL.md) | Draws typed steps, labeled handoffs, conditional provider routes and missing inputs. |

## Run the page locally

Use Node.js 22. Run `npm ci`, then `npm run dev`. Open the printed local URL to edit the example or copy the standalone skill. Run `npm test` for the planner and spending limits. The concurrency test uses Redis if `redis-server` and `redis-cli` are installed.

## How the cookbook plans

The browser and default CLI use the cookbook planner. The same submit path handles typed requests and examples. Each custom resource declares its name, kind, expected input, expected output and an optional source reference. Paths and URLs supplied here are text for the future agent. The server does not fetch them or look for credentials.

The planner can use packaged methods, match unfamiliar declared tools and skills by their contracts, and inspect public Treg catalog candidates. A known URL can skip company discovery. A local transcriber or an existing transcript changes the recording recipe. If inputs or compatible tools are missing, the recipe includes the outstanding dependency for the user to resolve. Estimates distinguish published Treg prices from unpriced local or account-dependent work.

Send a JSON POST to `/api/recipe` with `{ "useCase": "...", "brief": { "source": "cookbook", "inputs": "...", "resources": [] } }`. Use `Accept: application/x-ndjson` for the planning log. The normal cookbook flow requires no model key. The older request formats remain supported.

## Optional model-backed API

For direct OpenAI generation, configure a dedicated project key and pin its organization and project IDs on the server with the variables in [.env.example](.env.example). The planner uses the standard processing tier of `gpt-4.1-nano-2025-04-14`. Each request reserves $0.027 before either of its two bounded completions. The shared ledger enforces **$10 lifetime** and **$1 per UTC day**. Unused portions of reservations stay counted, including after failures. These ceilings cover planning. The estimated recipe costs describe what a separate run of the selected catalog tools could cost.

Set `KITCHEN_BUDGET_STORE=blob` on Vercel and connect a dedicated private Blob store to production. Before the first generation, initialize a **new** store with `node scripts/init-blob-budget.js` under its store-scoped token. The app uses conditional writes against the latest stored balance. Preserve this ledger across deployments and restore its previous totals if migrating stores. Missing or invalid state pauses generation.

For a Redis deployment, choose `KITCHEN_BUDGET_STORE=redis` and supply its REST URL and token. Before launch, seed the persistent hash `treg-kitchen:production:daily` with `version=1`, `day` equal to the current UTC epoch day, and the reconciled `spent` and `lifetimeSpent` totals in micro USD. An existing daily-only deployment needs its historic reservations reconciled before the lifetime limit can be enabled. The hash must have no expiry.

The original Vercel AI Gateway option remains available by configuring `KITCHEN_MODEL_PROVIDER=gateway` on a team with verified included credits, auto-reload disabled and the Gemini Flash Lite model available. Set `KITCHEN_FREE_CREDITS_VERIFIED=1` and configure the same spending ledger.

The optional model-backed request sends the use case to the selected planning model and short, generic searches to Treg. `POST /api/recipe` accepts `{"useCase":"..."}` or `{"example":true}`. JSON is the default response. Send `Accept: application/x-ndjson` to receive progress events followed by a recipe or an error. All catalog operations are public reads.

MIT licensed. An independent tool built on Treg's public catalog.

The graph uses the [Gmail product icon](https://www.gstatic.com/images/branding/product/1x/gmail_2020q4_48dp.png) and [Treg’s project mark](https://github.com/superdesigndev/treg/blob/main/src/treg/web/favicon.svg) to identify planned steps. Each mark belongs to its respective owner.

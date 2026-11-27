# treg-kitchen

Describe a job and the inputs you already have. treg-kitchen drafts an editable recipe from the live Treg catalog with an explanation for each tool choice.

[Open treg-kitchen](https://treg-kitchen.ragnos.io)

## Use the skill

Paste the full contents of [SKILL.md](SKILL.md) into an agent with public web access, or install it as a skill in your agent's supported format. The demo’s **Copy skill** button copies the same file. Use a generic description when searching the public catalog.

## Run the page locally

Use Node.js 22. Run `npm ci`, then `npm run dev`. Open the printed local URL to edit the example or copy the standalone skill. Run `npm test` for the planner and spending limits. The concurrency test uses Redis if `redis-server` and `redis-cli` are installed.

## Enable recipe generation

The Kitchen terminal streams the search phrases sent to Treg and the endpoint IDs opened for inspection. **Try an example** checks a prewritten recipe against the public catalog without a model call. Adjust calls per step and recipe runs to see estimated tool costs. The Markdown export includes the same quantities and pricing assumptions. A missing price stays unknown. Routed prices may be lower bounds.

For direct OpenAI generation, configure a dedicated project key and pin its organization and project IDs on the server with the variables in [.env.example](.env.example). The planner uses the standard processing tier of `gpt-4.1-nano-2025-04-14`. Each request reserves $0.027 before either of its two bounded completions. The shared ledger enforces **$10 lifetime** and **$1 per UTC day**. Unused portions of reservations stay counted, including after failures. These ceilings cover planning. The estimated recipe costs describe what a separate run of the selected catalog tools could cost.

Set `KITCHEN_BUDGET_STORE=blob` on Vercel and connect a dedicated private Blob store to production. Before the first generation, initialize a **new** store with `node scripts/init-blob-budget.js` under its store-scoped token. The app uses conditional writes against the latest stored balance. Preserve this ledger across deployments and restore its previous totals if migrating stores. Missing or invalid state pauses generation.

For a Redis deployment, choose `KITCHEN_BUDGET_STORE=redis` and supply its REST URL and token. Before launch, seed the persistent hash `treg-kitchen:production:daily` with `version=1`, `day` equal to the current UTC epoch day, and the reconciled `spent` and `lifetimeSpent` totals in micro USD. An existing daily-only deployment needs its historic reservations reconciled before the lifetime limit can be enabled. The hash must have no expiry.

The original Vercel AI Gateway option remains available by configuring `KITCHEN_MODEL_PROVIDER=gateway` on a team with verified included credits, auto-reload disabled and the Gemini Flash Lite model available. Set `KITCHEN_FREE_CREDITS_VERIFIED=1` and configure the same spending ledger.

The app sends the use case to the selected planning model and short, generic searches to Treg. `POST /api/recipe` accepts `{"useCase":"..."}` or `{"example":true}`. JSON is the default response. Send `Accept: application/x-ndjson` to receive progress events followed by a recipe or an error. All catalog operations are public reads.

MIT licensed. An independent tool built on Treg's public catalog.

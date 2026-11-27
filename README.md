# treg-kitchen

Describe a job and the inputs you already have. treg-kitchen drafts an editable recipe from the live Treg catalog with an explanation for each tool choice.

[Open treg-kitchen](https://treg-kitchen.ragnos.io)

## Use the skill

Paste the full contents of [SKILL.md](SKILL.md) into an agent with public web access, or install it as a skill in your agent's supported format. The demo’s **Copy skill** button copies the same file. Use a generic description when searching the public catalog.

## Run the page locally

Use Node.js 22 and run `npm run dev`. Open the printed local URL to edit the example or copy the standalone skill. Run `npm test` for the planner and spending limits. The concurrency test uses Redis if `redis-server` and `redis-cli` are installed.

## Enable recipe generation

The public demo uses Vercel with a project OIDC token for AI Gateway and a shared Upstash-compatible Redis REST endpoint. Use a team with verified included Gateway credits, auto-reload disabled, and the selected Gemini Flash Lite model available to the team. Set `KITCHEN_FREE_CREDITS_VERIFIED=1`, then configure the two Redis variables in [.env.example](.env.example). Vercel project OIDC supplies the token in production. Local generation also accepts a scoped AI Gateway key.

Each request reserves up to $0.027 against a shared $1 daily ceiling that resets at midnight UTC. The reservation covers up to two model calls. Reservations stay counted when a call fails or costs less than reserved. A failed reservation, higher model rates, or exhausted Gateway credits pauses generation, while editing the example and copying the skill remain available.

The app sends the use case to the planning model and short, generic searches to Treg. It uses public catalog reads to draft a recipe. Its output includes no provider calls or account-specific availability checks.

MIT licensed. An independent tool built on Treg's public catalog.

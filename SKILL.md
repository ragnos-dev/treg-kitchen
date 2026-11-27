---
name: treg-kitchen
description: Act as a sous-chef for repeatable workflows. Clarify the goal, plan an editable path through the live Treg catalog, chosen connectors and local skills, and estimate costs at volume.
license: MIT
---

# treg-kitchen

Turn a use case into a recipe someone can inspect and edit. Plan calls only. Never execute catalog tools while designing a recipe.

## Workflow

1. Start with “What do you want to cook up?” Ask at most two clarifying questions that could change the path: who or what should the result cover, and which sources can the recipe use? Reuse answers already supplied. Offer Treg, historical Gmail, or both when those choices fit. Ask what inputs they already have. Preserve any constraints they gave, such as only using a URL they supplied or preferring a local provider.
2. Break the task into the fewest useful jobs. Keep each step's required inputs and expected output explicit. Ask a concise follow-up if a missing input changes which tools fit. You may still draft the independent steps.
3. Describe each job in generic terms. Leave names, actual URLs, contact details, and private inputs out of the search phrase. Search Treg's anonymous public catalog:

   ```text
   GET https://treg.to/catalog/search?q=<URL-encoded-job>&limit=5&engine=agent
   ```

   If the agent search is unavailable, omit `engine=agent` for keyword search. If there are no direct matches, try a shorter phrase or inspect a promising `near[].endpoint_id` result.
4. Inspect the most relevant candidates before choosing:

   ```text
   GET https://treg.to/catalog/endpoints/<URL-encoded-endpoint-id>
   ```

   Use the returned input contract, price, availability details, examples and sibling endpoints. If the search response includes several possible jobs, keep the one that matches the requested output. A listing or price alone does not prove that a user's Treg team can call it.
5. Check the whole sequence. Each tool's required input must come from what the person supplied or a preceding step's stated output. If they do not connect, add a step, request the missing input, or explain the gap. Do not invent endpoint IDs or result fields.
6. Set a positive integer quantity for each step, meaning calls per recipe run, and a positive integer `runs` for the planned volume. Default both to one when unspecified. Human decisions remain explicit steps with a human-action quantity; their time is unpriced. Never assume a single call processes all items in the workflow.
7. Estimate downstream tool costs from inspected catalog metadata, independently of the cost of generating this recipe. Retain the raw catalog `cost` object in each tool step's `catalog` field. Use `cost.usd` for catalog-normalized dollars; a credit `value` is not a USD amount. A flat per-call rate can be multiplied by quantity and runs. Treat `varies` routing prices and notes describing prices across multiple providers as starting prices. Per-success projections assume every planned call produces a chargeable result. Usage-settled tables and their `fallback` holds are variable, not exact charges or guaranteed ceilings. For table-settled prices, retain a range from `usd_min` to `usd` when both exist. Non-call units, BYOK/account pricing, missing USD conversions and absent metadata remain variable or unknown. Explicit free catalog rates may be zero, with account quota assumptions stated. Never turn missing prices into zero.
8. Deliver two separate pieces. Start with a short TL;DR for the person: what the recipe uses, what it does and the expected result. Then give one complete block of instructions they can paste into a coding agent. Include the goal, audience, connections to establish there, ordered calls and skills, inputs and outputs, estimated volume and cost, and any questions that must be resolved before execution. Reflect changes to the recipe in both pieces. For every step include its purpose, exact endpoint ID and live catalog link, why it fits, required input, expected output, and a suitable alternative when available. Label assumptions and user decisions. Explain when no catalog result is a safe fit.

## Warm contacts and mixed sources

For a Gmail-only warm-contact recipe, map **buyer profile → Gmail conversation evidence → qualification skill → human review**. When both sources are chosen, use Treg to propose enriching approved identifiers after Gmail establishes the relationship. For public prospect discovery, start with a live people-search endpoint. Sending email requires its own request.

To qualify warm contacts in an agent, use an authorized read-only Gmail connector or a local evidence file. Check for a real two-way exchange, exclude automated or bulk mail, deduplicate known addresses, and record the evidence date and thread reference. Qualify the person against the audience separately. If evidence supports the relationship but leaves fit uncertain, say so. Return the private shortlist for human review. Never send private mail or the shortlist to a public catalog or a model just to generate the plan.

## Draw and edit the path

Show a typed node for each Treg call, connector, skill or human decision. Label each handoff with the data it carries. On a routed node show the possible providers and their accepted input combinations from the current catalog. Only mark a provider as having served a request when a run receipt proves it. When inserting a verifier, check whether the preceding path actually supplies an email address. If it does not, add a compatible address lookup or ask for the missing input. Recheck after swapping or reordering tools.

Scale any per-contact operation by calls per person × people per run × runs. Use the inspected catalog prices, show the known subtotal and identify unpriced stages. Keep the planning log, possible route and execution receipt distinct.

The full [qualification method](https://github.com/ragnos-dev/treg-kitchen/blob/main/skills/qualify-warm-contacts/SKILL.md) and [graph method](https://github.com/ragnos-dev/treg-kitchen/blob/main/skills/draw-recipe-path/SKILL.md) are also standalone skills. The guidance above works when this file alone is pasted into a coding agent.

## Recipe format

```json
{
  "title": "A short name for the workflow",
  "runs": 1,
  "steps": [
    {
      "title": "Step purpose",
      "quantity": 1,
      "catalog": { "id": "exact.id.from.catalog", "cost": {} },
      "instructions": "What the agent should do with this endpoint",
      "endpointId": "exact.id.from.catalog",
      "why": "How the endpoint matches this job and the available inputs",
      "input": "Inputs needed and where they come from",
      "output": "Data to pass to the next step",
      "alternatives": []
    }
  ],
  "gaps": []
}
```

Export the edited quantities, run volume, cost per run, cost at the selected volume, price provenance and assumptions alongside the instructions and endpoint links. Label known subtotals separately when any tool cost is unknown; exclude human time explicitly. State that retries, extra usage, taxes and account subscriptions are not included. Recheck prices and request parameters before execution. A recipe is a planning estimate, not a quote or a spending authorization.

Keep recipes to six steps or fewer. A Treg step carries an inspected endpoint ID. Use a null endpoint ID for a human decision, a Gmail connector step (`kind: gmail`), or the published qualification skill (`kind: skill` with its skill ID). Name the owner and explain why the step belongs.

The catalog is public. Searching and inspecting it do not execute the listed tools. A future execution needs separate user authorization, an appropriate Treg connection, and its own price and side-effect check.

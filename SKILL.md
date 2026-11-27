---
name: treg-kitchen
description: Plan an explainable, editable sequence of tool calls for a use case by searching Treg's live public catalog. Use when someone wants to decide which Treg tools an agent should call or design a repeatable workflow.
license: MIT
---

# treg-kitchen

Turn a use case into a recipe someone can inspect and edit. Plan calls only. Never execute catalog tools while designing a recipe.

## Workflow

1. Ask what the person wants to accomplish and what inputs they already have. Preserve any constraints they gave, such as only using a URL they supplied or preferring a local provider.
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
6. Present an editable recipe. For every step include its purpose, exact endpoint ID and live catalog link, why it fits, required input, expected output, and a suitable alternative when available. Label assumptions and user decisions. Explain when no catalog result is a safe fit.

## Recipe format

```json
{
  "title": "A short name for the workflow",
  "steps": [
    {
      "title": "Step purpose",
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

Keep recipes to six steps or fewer. A step without an endpoint is permitted only for a real human decision, with the reason in `why`. Never present a human decision as an API call.

The catalog is public. Searching and inspecting it do not execute the listed tools. A future execution needs separate user authorization, an appropriate Treg connection, and its own price and side-effect check.

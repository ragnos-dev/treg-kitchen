---
name: check-source-evidence
description: Compare a specific claim with supplied source text and return a cited passage or explain the limits of the evidence. Use when the source is named or the material has already been retrieved.
license: MIT
---

# Check source evidence

1. Capture the exact claim and the source the user wants checked. Use the supplied page and its extracted text or another source the user authorized. If you have only a company name, establish the organization and relevant page before treating the page as its source.
2. Check that the retrieved record actually contains the requested material. Keep the page URL or file reference, title, and section or page locator when available. A login page, truncated extract, snippet, or unrelated redirect leaves the claim unresolved. Record the missing material and ask for a readable copy or permission to use an alternate source.
3. Compare the claim with the passage in context. Check the entity, timeframe, numbers, scope, and qualifying language. A match on the topic alone offers no support. Assess distinct parts of a compound claim individually when the evidence differs.
4. Use one verdict per claim or claim part. Use **Supported** if the passage directly establishes it, **Partially supported** if only some of it is established, **Contradicted** if the source directly conflicts, or **Unsupported by this source** if a usable source contains no supporting evidence. Use **Unavailable** if the material could not be read or identified.
5. Return the claim, verdict, shortest exact passage that supports the assessment if one exists, source locator, and a sentence explaining the match or gap. Keep the source's own claim separate from independent verification. Describe conflicting passages together and leave any unresolved part visible.

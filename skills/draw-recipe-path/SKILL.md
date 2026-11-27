---
name: draw-recipe-path
description: Turn an editable Kitchen recipe into a typed, source-linked workflow graph that distinguishes a proposed tool call from a catalog inspection or an actual execution.
license: MIT
---

# Draw a recipe path

Use the edited recipe as the source of truth. Put the goal at the entrance and the requested deliverable at the exit. In between, show the actual owners in order. Use a labeled rectangle for a Treg endpoint, Gmail connector or local skill. Use a decision shape for a human judgment, and an outcome terminal for the result. Name the handoff on the line between nodes, such as “people with a known email address.” On narrow screens read the path from top to bottom.

Keep tool calls teal, human decisions pink, and endpoints of the workflow neutral. Give skills and connectors explicit text labels. Show selected nodes with an outline and a focused inspector. Use the same naming and pricing quantities as the exported recipe.

For a routed endpoint, open a separate view of its inspected catalog routing plan. Display supported identity field combinations, conditional providers and miss conditions from the live response. Inspecting a provider is a planning event. Mark a provider as actually tried or served only if an execution receipt supplies that evidence.

After any tool switch, insertion or reorder, recheck the downstream inputs against earlier outputs. Mark a missing address on the edge into an email verifier and offer an email-finding step only if an inspected endpoint can produce it. Keep any remaining identity requirements visible. Recompute per-person call quantities and the total for the selected run volume.

A trace, a proposed recipe and a completed run answer different questions. Give each state its own label. Copy the same steps, order, inputs, outputs and assumptions the user sees in the graph.

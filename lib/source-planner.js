// This planner never sends the brief or contact records to a model or catalog.
// Catalog requests are fixed capability phrases; actual execution is a separate job.
export const QUALIFICATION_SKILL_URL =
  "https://github.com/ragnos-dev/treg-kitchen/blob/main/skills/qualify-warm-contacts/SKILL.md";

export function contactIntent(useCase) {
  return /\b(?:leads?|prospects?|prospecting|contacts?|customers?|buyers?|warm|outreach)\b/i.test(useCase);
}

export function sourceSearch(useCase, brief, intent) {
  if (brief.source === "gmail") return "";
  if (brief.source === "both") return contactIntent(useCase) ? "enrich person professional profile" : "";
  return contactIntent(useCase) ? "search people by job title company industry location" : intent.query;
}

export function capabilityMatches(candidates, capability) {
  return candidates.filter((tool) => {
    if (tool.status && /deprecated|disabled|retired/i.test(tool.status)) return false;
    if (capability === "people.email.find" && /\.(?:get|status|result|results)$/.test(tool.id)) return false;
    if (tool.capability) return tool.capability === capability;
    const text = `${tool.id} ${tool.name || ""} ${tool.summary || ""}`;
    if (capability === "people.email.verify")
      return /email[.\s_-]*verify|verify.*email|email.*verif/i.test(text);
    // Result polling and bulk job readers cannot start an email search.
    if (capability === "people.email.find")
      return !/\.(?:get|status|result|results)$/.test(tool.id) && /email[.\s_-]*find|find.*email/i.test(text);
    if (capability === "people.enrich")
      return /people[.]enrich|enrich.*person|person.*enrich|email.*person|person.*email/i.test(text);
    return /people[.]search|search.*(?:people|contacts|prospects)|find people/i.test(text);
  });
}

export function describeEndpoint(tool) {
  return {
    kind: "treg",
    endpointId: tool.id,
    why: tool.summary || tool.name || "Matches the inspected public catalog capability.",
    input: tool.requiredInputs?.length
      ? "Required fields: " + tool.requiredInputs.map((item) => item.name).join(", ")
      : tool.inputNote || "Check the documented input alternatives before execution.",
    output: tool.outputFields?.length
      ? "Documented output fields: " + tool.outputFields.join(", ")
      : "Read the endpoint response contract; a missing result remains a miss.",
  };
}

const human = (title, input, output, instructions, why) => ({
  kind: "human",
  endpointId: null,
  title,
  input,
  output,
  instructions,
  why,
  alternatives: [],
});

export function sourceDraft(useCase, brief, intent, candidates, genericDraft) {
  const audience = human(
    "Define the audience and evidence",
    "Your goal and audience brief.",
    "An audience profile, exclusions and evidence required for a match.",
    `Audience: ${brief.audience}. Confirm relevant roles, organizations and exclusions before running the recipe.`,
    "The audience brief controls selection and qualification; it is kept out of public catalog searches.",
  );
  const contacts = contactIntent(useCase);
  if (brief.source === "treg") {
    const draft = genericDraft(intent, candidates);
    if (!contacts) return { ...draft, gaps: draft.gaps || [] };
    const matching = capabilityMatches(candidates, "people.search");
    const draftForPeople = genericDraft({ ...intent, leads: true }, matching);
    const steps = draftForPeople.steps.map((step, index) =>
      index === 0 ? audience : { ...step, kind: step.endpointId ? "treg" : "human" },
    );
    if (!steps.length) steps.push(audience);
    return {
      ...draftForPeople,
      steps,
      gaps: matching.length
        ? []
        : [
            "No inspected people-search endpoint matched this request. Refine the capability before adding a Treg step.",
          ],
    };
  }
  if (!contacts)
    return {
      title: "Clarify the mailbox workflow",
      steps: [audience],
      gaps: [
        `Describe what Gmail evidence should supply for this job${brief.source === "both" ? " and what a public catalog tool must add" : ""}. A contact-qualification workflow would not faithfully cover this request.`,
      ],
    };
  const gmail = {
    kind: "gmail",
    endpointId: null,
    title: "Find past two-way conversations in Gmail",
    alternatives: [],
    input: "The approved audience and an authorized Gmail connection at execution time.",
    output:
      "Deduplicated contacts with existing email addresses, relevant excerpts and source message links.",
    why: "Existing conversations provide relationship evidence that a public people search cannot establish.",
    instructions:
      "In your own agent, connect the mailbox the user selects with read-only access. Confirm the timeframe and scope, then search for two-way exchanges. Keep message links and excerpts as evidence. Exclude automated mail and people outside the audience. Keep private evidence in your own environment.",
  };
  const steps = [audience, gmail];
  const gaps = [];
  if (brief.source === "both") {
    const [tool, ...alternatives] = capabilityMatches(candidates, "people.enrich").filter((tool) =>
      tool.inputFields?.includes("email"),
    );
    if (tool)
      steps.push({
        ...describeEndpoint(tool),
        perContact: true,
        title: "Check current roles and companies with Treg",
        input:
          "Only approved identifiers from each Gmail contact, mapped to a supported identity option in the inspected endpoint.",
        output:
          "Current professional profile details or an explicit miss, joined back to the original Gmail evidence.",
        why: "The inspected endpoint enriches known people. Gmail supplies the relationship evidence; Treg supplies public professional context.",
        instructions:
          "After authorization to execute, pass only the identifiers needed for each contact. Never send message bodies, private excerpts or the audience brief to Treg. Keep misses explicit and preserve Gmail source links. Set calls per contact before running.",
        alternatives: alternatives.slice(0, 2).map(describeEndpoint),
      });
    else
      gaps.push(
        "No inspected person-enrichment endpoint matched. Gmail evidence can still be qualified; add enrichment only after inspecting a compatible endpoint.",
      );
  }
  steps.push({
    kind: "skill",
    endpointId: null,
    skillId: "qualify-warm-contacts",
    skillUrl: QUALIFICATION_SKILL_URL,
    title: "Check each contact against your audience",
    alternatives: [],
    input:
      "The audience profile, deduplicated Gmail contacts and their conversation evidence; any optional enrichment.",
    output: "An evidence-backed shortlist with fit, relationship context, unresolved gaps and message links.",
    why: "A reusable open skill performs the judgment that catalog search and enrichment do not provide.",
    instructions:
      "Open the linked qualification skill in the executing agent. Follow its evidence rules, explain each inclusion and keep unknowns explicit. No qualification agent runs inside this planner.",
  });
  steps.push(
    human(
      "Review the shortlist",
      "The qualification results and original message links.",
      "A private shortlist with a thread reference and a reason each contact qualifies.",
      "Review the evidence, exclusions and proposed next actions. Authorize any outreach separately.",
      "A person confirms context and decides what to do with the shortlist.",
    ),
  );
  return {
    title:
      brief.source === "both"
        ? "Find warm contacts and add professional context"
        : "Qualify warm contacts from Gmail",
    steps,
    gaps,
  };
}

export function additionDraft(addition, candidates) {
  const capability = addition === "verify-email" ? "people.email.verify" : "people.email.find";
  const [tool, ...alternatives] = capabilityMatches(candidates, capability);
  if (!tool)
    return {
      title: "No compatible email tool found",
      steps: [],
      gaps: ["No inspected endpoint can perform this email operation. No tool was added."],
    };
  const verify = addition === "verify-email";
  return {
    title: verify ? "Verify email addresses" : "Find work email addresses",
    gaps: [],
    steps: [
      {
        ...describeEndpoint(tool),
        perContact: true,
        title: verify ? "Verify each email address" : "Find each work email",
        instructions: verify
          ? "Use an email address already produced by an earlier step. Keep deliverability verdicts and unknown results distinct. This is a plan; no verification has run."
          : "Use a supported person identity from an earlier step, such as a name and company domain or profile URL. Keep misses explicit. This is a plan; no address lookup has run.",
        alternatives: alternatives.slice(0, 2).map(describeEndpoint),
      },
    ],
  };
}

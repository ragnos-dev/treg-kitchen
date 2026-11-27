import { catalogIntent } from "./catalog-draft.js";
import { capabilityMatches, describeEndpoint } from "./source-planner.js";

const step = (details) => ({ kind: "human", endpointId: null, alternatives: [], ...details });
const skill = (skillId, details) => step({ kind: "skill", skillId, ...details });
const custom = (resource, details) => step({
  kind: "custom", resourceKind: resource.kind, resourceName: resource.name, resourceSource: resource.source,
  title: `Use ${resource.name}`, input: resource.input, output: resource.output,
  why: `You supplied ${resource.name} with an input and output contract that fits this step.`,
  ...details,
  instructions: `${resource.source ? "Open the declared source" : "Identify and verify the resource's source"} in your agent and confirm prerequisites, access and cost before running it. Declared input: ${resource.input}. Declared output: ${resource.output}. ${details?.instructions || "Preserve a source reference for each result."}`,
});

const present = (value) => typeof value === "string" && value.trim();
const words = (text) => String(text || "").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()
  .match(/[a-z0-9]+/g) || [];
const terms = (text) => words(text).map(word => word.length > 4 ? word.replace(/ies$/, "y").replace(/(ss)es$/, "$1").replace(/([^s])s$/, "$1") : word);
const withoutAddresses = (text) => String(text || "").replace(/https?:\/\/[^\s<>"']+|[\w.+-]+@[\w.-]+/gi, " ");
const publicUrl = (text) => {
  for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
    try {
      const url = new URL(match[0].replace(/[),.;\]}]+$/, ""));
      if (!url.username && !url.password) return url.href;
    } catch {}
  }
  return "";
};

function namedValue(inputs, labels) {
  const re = new RegExp(`\\b(?:${labels})\\s*[:=]\\s*([^;\\n]+)`, "i");
  return inputs.match(re)?.[1].trim() || "";
}

const active = (tool) => typeof tool?.id === "string" && tool.id &&
  !/\.((?:job\.)?(?:get|status|result|results|poll)|cancel)$/i.test(tool.id) &&
  !/deprecated|disabled|retired|unavailable|inactive|offline|closed|removed/i.test(`${tool.status || ""} ${tool.availability || ""}`);
const fieldName = (field) => typeof field === "string" ? field : field?.name || "";
const fieldText = (field) => words(fieldName(field)).join(" ");
const io = (tool, key) => Array.isArray(tool[key]) ? tool[key].map(fieldText).filter(Boolean) : [];
const inputFields = (tool) => [...new Set([...io(tool, "inputFields"), ...io(tool, "requiredInputs")])];
const toolText = (tool) => [tool.capability, tool.id, tool.name, tool.summary].filter(Boolean).join(" ").replace(/[_.-]+/g, " ");
const resultFields = (tool) => io(tool, "outputFields");
const matchesAny = (items, pattern) => items.some(item => pattern.test(item));

// Routed tools also have to expose at least one route for the identity we can hand off.
function accepts(tool, supplied, contract = supplied) {
  const routes = Array.isArray(tool.routing?.plan) ? tool.routing.plan.flatMap(route =>
    Array.isArray(route.accepts) ? route.accepts : []) : [];
  return matchesAny([...inputFields(tool), ...routes.flatMap(group => group.map(fieldText))], contract) &&
    io(tool, "requiredInputs").every(field => supplied.test(field)) &&
    (!routes.some(group => group.length) || routes.some(group => group.length &&
      group.every(field => supplied.test(fieldText(field))) && matchesAny(group.map(fieldText), contract)));
}

async function lookUp(discover, query, match) {
  if (typeof discover !== "function" || !query) return [];
  try {
    const candidates = await discover(query);
    return Array.isArray(candidates) ? candidates.filter(active).filter(match)
      .filter((tool, index, all) => all.findIndex(other => other.id === tool.id) === index).slice(0, 3) : [];
  } catch {
    return [];
  }
}

function endpoint([tool, ...others], details) {
  return step({
    ...describeEndpoint(tool),
    ...details,
    alternatives: others.map(describeEndpoint),
  });
}

const pageAddress = /\b(?:url|urls|uri|link|links|site|address)\b/;
const pageBody = /\b(?:content|markdown|text|html|body)\b/;
const webQuery = /\b(?:query|q|keyword|term|company|name|organization|business)\b/;
const webResult = /\b(?:url|urls|link|links|website|domain|result|results|organic)\b/;
const audioInput = /\b(?:audio|file|recording|media|video|speech|url|uri)\b/;
const transcriptOutput = /\b(?:transcript|transcription|text|utterance|utterances|segment|segments|word|words)\b/;

function resourceFor(resources, input, output, goal) {
  const compatible = resources.filter(resource => input.test(resource.input) && output.test(resource.output));
  return compatible.find(resource => goal.toLowerCase().includes(resource.name.toLowerCase())) || compatible[0];
}

async function companyRecipe(goal, inputs, resources, discover) {
  const combined = `${inputs}\n${goal}`;
  const url = publicUrl(combined);
  const pageText = namedValue(inputs, "page text|source text|page content|excerpt|passage|source excerpt") ||
    (/\b(?:pasted|copied|provided|supplied|attached)\b.{0,20}\b(?:page|source) (?:text|excerpt|content)\b|\b(?:page|source) (?:text|excerpt|content)\s+(?:is\s+)?(?:pasted|copied|provided|supplied|attached)\b/i.test(inputs) ? inputs : "");
  const company = namedValue(inputs, "company(?: name)?|business(?: name)?|organization(?: name)?") ||
    inputs.match(/\b(?:the )?(?:company|business|organization)(?: name)? is (.+?)[.;]?$/i)?.[1] ||
    goal.match(/\b(?:against|on|about|for|from)\s+([A-Z][\w.'’-]*(?:\s+[A-Z][\w.'’-]*)*)(?='s\b|’s\b|\s+(?:official\b|website\b|company page\b))/)?.[1] ||
    (!url && !pageText && present(inputs) && !/[:;\n]/.test(inputs) && !/\b(?:claim|page|url|website|provided|supplied|attached)\b/i.test(inputs) ? inputs.trim() : "");
  const claim = namedValue(inputs, "claim|statement|assertion") ||
    goal.match(/[“"]([^”"]+)[”"]/)?.[1] ||
    goal.match(/\b(?:verify|check|confirm|fact.check)\s+(?:(?:the\s+)?(?:company\s+)?(?:claim|statement|assertion)\s+)?(?:that|whether)\s+(.+?)(?=\s+(?:against|using|on (?:the|its|their) (?:official |company )?\b(?:page|website))\s+|$)/i)?.[1];
  const steps = [];
  const gaps = [];

  if (!url && !pageText) {
    const job = {
      title: "Resolve the company and official source",
      input: company ? `Company name: ${company}. Confirm the identity before choosing among close matches.` : "The exact company name and any disambiguating location or business details.",
      output: "One verified official company page URL relevant to the claim, or an unresolved identity.",
      why: "An official page must be attributed to the right company before its text is used as evidence.",
      instructions: "Use the company name to find its official site. Cross-check the name and one distinguishing detail, then choose a relevant company-owned page. Keep uncertain matches unresolved; do not send a guessed URL to the next step.",
      provides: ["official page URL"],
      evidence: "Confirm the domain is company-owned and refers to the intended business, not merely a close name match.",
    };
    const resolver = resourceFor(resources, /company|organization|business|name|query/i, /(?:official|company|public).*(?:url|website|domain)|(?:url|website|domain)/i, goal);
    const candidates = !resolver && company ? await lookUp(discover, "search official company website by name", tool =>
      /(?:web|compan(?:y|ies)|organization|business).*(?:search|find|lookup|domain)|(?:search|find|lookup).*(?:web|compan(?:y|ies)|business|site)/i.test(toolText(tool)) &&
      accepts(tool, webQuery) && (matchesAny(resultFields(tool), webResult) ||
      matchesAny(resultFields(tool), /^data$/) && /"domain"\s*:/i.test(tool.exampleOutput || ""))) : [];
    if (resolver) steps.push(custom(resolver, job));
    else if (candidates.length) steps.push(endpoint(candidates, job));
    else {
      steps.push(step({ ...job, ...(!company ? { kind: "blocked" } : {}) }));
      gaps.push(company ? "Resolve the company identity: no inspected search endpoint matched. Supply a confirmed official URL or use an approved search in your agent." : "Resolve the company identity: provide the exact company name or an official page URL.");
    }
  }

  if (!pageText) {
    const job = {
      title: "Read the official page",
      input: url ? `Supplied page URL: ${url}` : "The confirmed official URL from the company-identity step.",
      output: "Verbatim-readable page text, its source URL and any retrieval failure.",
      why: "The evidence check needs the actual page text and source URL, not a search result or a generated summary.",
      instructions: "Read or extract this public page only after its URL is confirmed. Keep the text as it appeared, along with the URL and, if known, the heading and retrieval date. Preserve failures rather than inventing content.",
      requires: url ? [] : ["official page URL"],
      provides: ["page text and source URL"],
      evidence: "Check that the returned text is from the selected URL and not from an unrelated redirect, access page, or search summary.",
    };
    const reader = resourceFor(resources, pageAddress, pageBody, goal);
    const candidates = !reader ? await lookUp(discover, "extract web page text from URL", tool =>
      /extract|read|scrape|fetch|crawl/i.test(toolText(tool)) && accepts(tool, pageAddress) &&
      (matchesAny(resultFields(tool), pageBody) || matchesAny(resultFields(tool), /^pages?$/) &&
        (tool.capability === "web.extract" || /(?:page|web).*(?:text|content)|(?:text|content).*(?:page|web)/i.test(tool.summary || "")))) : [];
    if (reader) steps.push(custom(reader, job));
    else if (candidates.length) steps.push(endpoint(candidates, job));
    else {
      steps.push(step(job));
      gaps.push("Read the official page: no inspected page-reading endpoint matched. Supply the page text with its URL, or use a reader available to your agent.");
    }
  } else if (!url) gaps.push("Check the claim: provide the original URL for the supplied page text so the result can be cited.");

  if (!claim) gaps.push("Check the claim: provide its exact wording before deciding whether the page supports it.");
  steps.push(skill("check-source-evidence", {
    title: "Check the claim against the page",
    input: pageText ? "The exact claim, the supplied page text and its original source URL." : "The exact claim, page text and source URL from Read the official page.",
    output: "A cited passage supporting or contradicting the claim, or an explicit unsupported result with the evidence gap.",
    why: "The page may mention the same topic without proving the claim. Comparing the exact wording is a separate judgment.",
    instructions: `${claim ? `Claim to check: ${claim}\n` : ""}Quote the exact relevant passage, cite its URL and heading if available, and label the claim supported, contradicted or unsupported. If the text or URL is missing, retain that gap and do not present a cited result.`,
    requires: pageText ? [] : ["page text and source URL"],
    provides: ["cited claim assessment"],
    evidence: "Quote the exact passage at the original URL, or explain which part of the claim is unsupported.",
  }));

  return { title: "Check a company claim", steps, gaps };
}

async function recordingRecipe(goal, inputs, resources, discover) {
  const isTranscript = Boolean(namedValue(inputs, "transcript(?: text|s| file)?|captions") ||
    /\b(?:transcripts?|captions?|\.vtt|\.srt)\b/i.test(inputs)) &&
    !/\b(?:no|without|need(?:s|ed)?|missing)\s+(?:a |the )?transcripts?\b/i.test(inputs);
  const transcript = isTranscript || /\b(?:use|summari[sz]e|turn|from|have|rewrite|provided|attached)\s+(?:(?:the|my|our|these|this|a|an|attached|supplied|existing)\s+){0,3}transcripts?\b/i.test(goal);
  const recording = Boolean(namedValue(inputs, "recordings?|audio(?: files?)?|media") ||
    /\b(?:audio|recordings?|media)\b|\.(?:mp3|m4a|wav|mp4|flac|ogg)\b/i.test(inputs)) &&
    !/\b(?:no|without|need(?:s|ed)?|missing)\s+(?:a |the )?(?:audio|recordings?)\b/i.test(inputs);
  const needsTemplate = /\btemplate\b/i.test(goal) || Boolean(namedValue(inputs, "template(?: path| file)?"));
  const template = Boolean(namedValue(inputs, "template(?: path| file)?") ||
    /\b(?:template|brief format)\b|[^\s,;]*template[^\s,;]*\.(?:md|txt|docx?|odt|pdf|html)\b/i.test(inputs) &&
    !/\b(?:no|without|need(?:s|ed)?|missing)\s+(?:a |the )?template\b/i.test(inputs));
  const briefing = /\b(?:brief|minutes|write.up|recap|summari[sz]e|summar(?:y|ies)|notes|action items)\b/i.test(goal) || needsTemplate;
  const smallCounts = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
  const units = new Set([...`${goal}\n${inputs}`.matchAll(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:(?:meeting|interview|video|call)\s+)?(?:audio(?: files?)?|recordings?|transcripts?)\b/gi)]
    .map(match => Number(match[1]) || smallCounts.indexOf(match[1].toLowerCase())).filter(count => count > 0 && count <= 1_000_000));
  const peoplePerRun = units.size === 1 ? [...units][0] : undefined;
  const gaps = [];
  const steps = [];

  if (transcript) {
    steps.push(step({
      title: "Collect the supplied transcript and source references",
      input: "The available transcript or caption file, plus the recording names or source links.",
      output: "Transcript text with source references and timestamps where available.",
      why: "Existing transcripts avoid sending audio to a service or paying to transcribe twice.",
      instructions: "Open the transcript locally. Associate it with the correct recording, keep timestamps or line ranges, and record unclear passages. If a file was only mentioned, ask for its path. Do not infer timestamps that are absent.",
      provides: ["source-linked transcript"],
      evidence: "Each transcript is mapped to a specific recording, with any missing timestamps or source references noted.",
    }));
    if (!isTranscript) gaps.push("Collect the supplied transcript: provide its text or local file path before running the recipe.");
  } else {
    const job = {
      title: "Transcribe the recordings",
      input: "Each supplied recording and its source reference; map the recording to a documented file or media URL input.",
      output: "Transcript text linked to each original recording, with timestamps or segments when supported.",
      why: "The review needs searchable speech and a way to trace important points back to their recording.",
      instructions: "Confirm the audio format and permission before transcription. Keep the original source reference, preserve available timestamps, flag inaudible passages and set one call per audio item unless the tool supports batches. If only text is returned, cite the recording and transcript section rather than inventing timestamps.",
      provides: ["source-linked transcript"],
      evidence: "The result includes actual spoken text, identifiable original recordings, and timestamps or clearly labeled gaps.",
    };
    const transcriber = resourceFor(resources, audioInput, transcriptOutput, goal);
    const audioWithOptions = /\b(?:audio|file|recording|media|video|speech|url|uri|language|model|format|timestamp|timestamps)\b/;
    const candidates = !transcriber ? await lookUp(discover, "transcribe audio speech to timestamped text", tool =>
      /transcrib|transcript|speech to text/i.test(toolText(tool)) && accepts(tool, audioWithOptions, audioInput) &&
      !/\b(?:facebook|youtube|tiktok|instagram|post transcript)\b/i.test(`${tool.id} ${tool.capability || ""}`.replace(/[_.-]+/g, " ")) &&
      (/audio|recording|speech|media|file/i.test(toolText(tool)) || matchesAny(inputFields(tool), /audio|recording|speech|media|file/)) &&
      matchesAny(resultFields(tool), transcriptOutput)).then(items => items.sort((a, b) =>
        Number(matchesAny(resultFields(b), /segment|timestamp|utterance/)) - Number(matchesAny(resultFields(a), /segment|timestamp|utterance/)))) : [];
    if (transcriber) steps.push(custom(transcriber, {
      ...job, perItem: !/\b(?:multiple|batch|list|audio files|recordings)\b/i.test(transcriber.input),
    }));
    else if (candidates.length) steps.push(endpoint(candidates, { ...job, perItem: true }));
    else {
      steps.push(step({ ...job, kind: "blocked", title: "Provide transcripts or choose a local transcriber", instructions: "Use transcripts already available to you, or identify a transcriber installed in the executing environment. Confirm it supports the recording format and preserve source references. Do not proceed until one path is confirmed." }));
      gaps.push("Transcribe the recordings: no compatible inspected transcription option was found. Supply a transcript or identify an available local transcriber.");
    }
    if (!recording) gaps.push("Transcribe the recordings: provide the source files or accessible recording references in your agent.");
  }

  if (briefing) {
    if (needsTemplate && !template) gaps.push("Write the brief: supply the team's template or its local file path.");
    const job = {
      title: "Write the brief",
      input: `The transcript text with recording references and available timestamps${needsTemplate ? ", plus the team's local template" : ""}.`,
      output: "A draft brief with recording links or file references and timestamp or transcript citations for key points.",
      why: "The brief has to follow the requested structure and retain a way to check the statements against the source.",
      instructions: `${needsTemplate ? "Open the team's template in the executing agent. Preserve headings and required fields; flag any missing section or unavailable template. " : "Use concise sections appropriate for the requested brief. "}Cite a timestamp, transcript section or line range for decisions and important claims. Separate decisions from discussion, and do not assign an owner or deadline that the source does not establish.`,
      requires: ["source-linked transcript"],
      provides: ["sourced brief draft"],
      evidence: "Every important statement can be traced to a recording timestamp or a transcript section, and the draft follows the required headings.",
    };
    const writer = resourceFor(resources, /transcript|captions/i, /\b(?:brief|minutes|recap|summary|notes)\b/i, goal);
    steps.push(writer ? custom(writer, job) : skill("write-template-brief", job));
  }
  steps.push(step({
    title: briefing ? "Review the brief against the source" : "Review the transcript against the audio",
    input: briefing ? "The draft brief, template if required, and its transcript or recording references." : "The transcript, recording references and playback access.",
    output: briefing ? "A reviewable brief with source references and clearly marked unknowns." : "A reviewable transcript with sources, available timestamps and marked gaps.",
    why: "Review catches wording, speaker and attribution errors before the result is shared.",
    instructions: briefing ? "Check template coverage and spot-check important statements, decisions and attributions against the recording or transcript. Leave unresolved items visible." :
      "Spot-check speaker changes, names and important passages. Mark uncertain audio and missing timestamps instead of guessing.",
    requires: briefing ? ["sourced brief draft", "source-linked transcript"] : ["source-linked transcript"],
  }));
  return { title: briefing ? "Turn recordings into a sourced brief" : "Produce a traceable transcript", steps, gaps, ...(peoplePerRun ? { peoplePerRun } : {}) };
}

async function warmRecipe(goal, inputs, resources, discover) {
  const combined = `${goal}\n${inputs}`;
  const gmail = /\bgmail\b/i.test(combined);
  const source = resourceFor(resources, /message|email|conversation|crm|contact|meeting/i, /message|email|conversation|relationship|meeting/i, goal);
  const history = /\b(?:conversation|message|mailbox|crm|notes|meetings?|slack|outlook|address book)\b/i.test(inputs);
  const audience = namedValue(inputs, "audience|target|profile|buyer");
  const gaps = [];
  const steps = [step({
    title: "Define who fits the audience",
    input: audience ? `Supplied audience: ${audience}` : "The desired audience, example qualifiers and exclusions.",
    output: "A short audience profile with explicit fit criteria and exclusions.",
    why: "Fit and an existing relationship are separate claims that need different evidence.",
    instructions: "Reuse the supplied audience details. Confirm the most important role, organization or interest signals, and what to exclude.",
    provides: ["audience profile"],
  })];
  if (!audience && !present(inputs) && !/\b(?:who are|such as|specifically|in the|that (?:run|own|work))\b/i.test(goal))
    gaps.push("Define who fits: specify the audience and the fit or exclusion criteria.");
  const job = {
    title: gmail ? "Find past two-way conversations in Gmail" : "Find evidence of past two-way conversations",
    input: "The audience profile and an approved source of past correspondence, meetings or conversations.",
    output: "Deduplicated contacts with known email addresses where present, evidence of prior interaction and links to the original records.",
    why: "Public search results and names in a contact list do not establish a prior relationship.",
    instructions: `${gmail ? "Connect the mailbox the user chooses with read-only access in the executing agent. " : ""}Confirm source, timeframe and scope. Look for genuine two-way messages or documented interactions, not automatic mail or one-way lists. Keep private content and citations in your agent.`,
    requires: ["audience profile"],
    provides: ["contact and conversation evidence"],
    evidence: "Each contact has a source record of prior interaction, with the relevant evidence kept private.",
  };
  if (source) steps.push(custom(source, job));
  else {
    steps.push(step({ ...job, ...(!gmail && !history ? { kind: "blocked" } : gmail ? { kind: "gmail" } : {}) }));
    if (!gmail && !history) gaps.push("Find past conversations: identify an authorized mailbox, CRM, or set of conversation records; do not substitute a public people search.");
  }

  if (/\b(?:enrich|enrichment|current (?:roles?|companies|employers?|titles?)|professional profiles?|public profiles?)\b/i.test(combined)) {
    const email = /\b(?:email|e mail)\b/;
    const enrichmentResource = resourceFor(resources, /\b(?:emails?|contacts?|identifiers?|people)\b/i, /\b(?:professional profile|company|role|title|employer)\b/i, goal);
    const enrichment = !enrichmentResource ? await lookUp(discover, "enrich person professional profile", tool =>
      capabilityMatches([tool], "people.enrich").length && accepts(tool, email) &&
      matchesAny(resultFields(tool), /profile|title|role|company|organization|employer|person|data/)) : [];
    const enrichmentJob = {
      title: "Check current professional details", perContact: true,
      input: "An approved email identifier from the conversation evidence for each contact, where available.",
      output: "Current role or company details, or an explicit miss, joined back to the original contact.",
      why: "Public professional context can inform fit, but does not establish any relationship.",
      instructions: "After authorization, send only the identifier needed for the selected endpoint. Keep private excerpts in your own agent. Set calls per contact before running and leave misses explicit.",
      requires: ["contact and conversation evidence"],
      provides: ["professional context"],
    };
    if (enrichmentResource) steps.push(custom(enrichmentResource, enrichmentJob));
    else if (enrichment.length) steps.push(endpoint(enrichment, enrichmentJob));
    else gaps.push("Check current professional details: no compatible enrichment endpoint accepted the identifiers this recipe supplies. Qualify the contacts without enrichment or supply an approved alternative.");
  }
  steps.push(skill("qualify-warm-contacts", {
    title: "Qualify contacts against the audience",
    input: "The audience profile, conversation evidence and any optional public context.",
    output: "An evidence-backed shortlist with separate fit and relationship reasons, source links and unknowns.",
    why: "A person can be a warm contact without being a fit, or be a fit without any existing relationship.",
    instructions: "Use the qualification skill in your own agent. Require both a fit reason and a genuine interaction for each inclusion. List unsupported claims and duplicates separately.",
    requires: ["audience profile", "contact and conversation evidence", ...(steps.some(item => item.provides?.includes("professional context")) ? ["professional context"] : [])],
    provides: ["qualified shortlist"],
  }), step({
    title: "Review the short list",
    input: "The qualified contacts and links to their underlying conversation evidence.",
    output: "A private, reviewable shortlist with fit and prior-relationship evidence for each person.",
    why: "The user can assess sensitive relationship context and decide whether to follow up.",
    instructions: "Spot-check the sources and review the exclusions. This recipe ends at review; outreach is not a planned action.",
    requires: ["qualified shortlist"],
  }));
  return { title: "Find and qualify warm contacts", steps, gaps };
}

const filler = new Set("a an and as at by for from have i in into is it me my of on or our please the them these they this to use using want with would you your make help need do get then produce tool skill local".split(" "));
const significant = (value) => [...new Set(terms(withoutAddresses(value)).filter(word => !filler.has(word)))];
const overlap = (a, b) => a.filter(word => b.includes(word));
const mentions = (value, name) => {
  const text = ` ${words(value).join(" ")} `;
  return text.includes(` ${words(name).join(" ")} `);
};
const actions = [
  { find: /\b(?:validat\w*|verif\w*|check|confirm)\b/i, query: "verify", tool: /verify|validate|check|status/ },
  { find: /\b(?:extract\w*|scrap\w*|crawl\w*|read|download|parse)\b/i, query: "extract", tool: /extract|scrape|crawl|read|parse|fetch|convert/ },
  { find: /\b(?:translat\w*)\b/i, query: "translate", tool: /translate|translation/ },
  { find: /\b(?:convert\w*|transform\w*|format\w*)\b/i, query: "convert", tool: /convert|transform|format|export/ },
  { find: /\b(?:find|search\w*|look up|discover\w*|compare|track|monitor|fetch|retrieve|list|pull|collect)\b/i, query: "search", tool: /search|find|list|lookup|fetch|forecast|compare|enrich|price|quote|trend|discover/ },
  { find: /\b(?:generat\w*|creat\w*|draw|render\w*)\b/i, query: "generate", tool: /generat|creat|draw|render/ },
  { find: /\b(?:analy[sz]\w*|summari[sz]\w*|classif\w*|detect\w*)\b/i, query: "analyze", tool: /analy[sz]|summari[sz]|classif|detect/ },
];
const commonParameters = /\b(?:limit|language|count|locale|format|type|country|region|date|days|model|units|page|size|sort)\b/;
const genericInput = /\b(?:query|q|term|keyword|url|uri|file|text|address|name|symbol|ticker|origin|destination|location|city|code|company|domain|document|id|product|coordinates|currency|base|target|source|image|prompt|data|content)\b/;
const genericResults = /\b(?:result|results|data|content|text|items|status|matches|records|output)\b/;

function genericCatalogJob(goal) {
  const requested = withoutAddresses(goal).replace(/["“][^"”]*["”]/g, " ");
  // Reconstruct from a public vocabulary; free text, resource names and inputs never become queries.
  const aliases = { product: "products", price: "prices", keyword: "keywords", filing: "filings", listing: "listings",
    forecast: "weather", ticker: "stock", sport: "sports", restaurant: "restaurants" };
  const intent = catalogIntent(requested.replace(/\b\w+\b/g, word => Object.hasOwn(aliases, word.toLowerCase()) ? aliases[word.toLowerCase()] : word));
  if (intent.leads || /\b(?:prospect\w*|(?:new|potential) (?:customers?|buyers?))\b/i.test(requested)) return {
    query: "search people by job title company industry location",
    targets: ["people", "contact", "person"], match: tool => capabilityMatches([tool], "people.search").length &&
      accepts(tool, /query|title|industry|location|company|count|limit|keyword|role|page|filter/) &&
      matchesAny(resultFields(tool), /person|people|contact|data|result|profile/),
  };
  const action = actions.map(item => ({ item, index: requested.search(item.find) }))
    .filter(match => match.index >= 0).sort((a, b) => a.index - b.index)[0]?.item;
  if (!action || !intent.query) return null;
  const targets = significant(intent.query).filter(word => !/^(?:verify|search|verify|extract|scrape|crawl|summarize|transcribe|translate|generate|compare|monitor|list|convert|create|analyze|research|discover|find)$/.test(word)).slice(0, 4);
  if (!targets.length) return null;
  if (targets.includes("email") && action.query === "verify") return {
    query: "verify email address", targets: ["email"], match: (tool) =>
      capabilityMatches([tool], "people.email.verify").length && accepts(tool, /email/) &&
      matchesAny(resultFields(tool), /status|result|data|valid|deliverab|verification|verdict/),
  };
  return { query: `${action.query} ${targets.join(" ")}`, targets, match: (tool) => {
    const descriptor = toolText(tool).toLowerCase();
    const subjects = overlap(targets, significant(`${descriptor} ${inputFields(tool).join(" ")} ${resultFields(tool).join(" ")}`));
    const supplies = (field) => genericInput.test(field) || commonParameters.test(field) || overlap(targets, significant(field)).length > 0;
    return subjects.length > 0 && action.tool.test(descriptor) &&
      inputFields(tool).some(field => genericInput.test(field) || overlap(targets, significant(field)).length) &&
      io(tool, "requiredInputs").every(supplies) &&
      resultFields(tool).some(field => genericResults.test(field) || overlap(targets, significant(field)).length);
  } };
}

function declaredPath(goal, inputs, resources, catalogJob) {
  const target = significant(goal);
  const available = significant(inputs);
  const explicit = resources.filter(resource => mentions(goal, resource.name));
  const requestedOutput = goal.match(/\b(?:into|produce|return|output|result should be)\s+(.+?)(?=\s+using\b|$)/i)?.[1] || goal;
  const wanted = significant(requestedOutput);
  const desired = (resource) => overlap(wanted, significant(resource.output)).length;
  const relevance = (resource) => overlap(target, significant(resource.input)).length + desired(resource);
  const possible = resources.filter(resource => explicit.includes(resource) || desired(resource) >= 1 && relevance(resource) >= 2)
    .sort((a, b) => Number(explicit.includes(b)) - Number(explicit.includes(a)) || desired(b) - desired(a) ||
      overlap(available, significant(b.input)).length - overlap(available, significant(a.input)).length);
  if (!possible.length) return [];
  const terminal = possible[0];
  const chosen = [];
  const visited = new Set();
  function add(resource) {
    if (visited.has(resource)) return;
    visited.add(resource);
    const needs = significant(resource.input);
    if (needs.length && overlap(available, needs).length < needs.length) {
      const producers = resources.filter(other => other !== resource && !visited.has(other) && overlap(needs, significant(other.output)).length)
        .sort((a, b) => overlap(needs, significant(b.output)).length - overlap(needs, significant(a.output)).length ||
          Number(explicit.includes(b)) - Number(explicit.includes(a)));
      if (producers[0]) add(producers[0]);
    }
    chosen.push(resource);
  }
  add(terminal);
  if (!catalogJob && explicit.length > 1) for (const resource of explicit) add(resource);
  return chosen;
}

const KEY_OPERATIONS = "(?:use|find|search|extract|verify|validate|check|look up|read|fetch|pull|convert|transform|write|format|create|compile|summari[sz]e|analy[sz]e|list|render|translate|compare|produce|score|generate)\\b";
function stageList(goal) {
  return goal.split(new RegExp(`\\b(?:and then|then|followed by|after that)\\s+|(?:;|,|\\band\\b)\\s*(?=${KEY_OPERATIONS})`, "i"))
    .map(stage => stage.trim().replace(/[;,]+$/, "")).filter(Boolean);
}

const artifactTerms = (value) => significant(value).filter(word => !/^(?:result|record|source|data|output|input|list|item|file|document|draft|step|table|check|new|format)$/.test(word));
const relates = (a, b) => Boolean(overlap(artifactTerms(a), artifactTerms(b)).length);

async function generalRecipe(goal, inputs, resources, discover) {
  const outcome = present(goal) || "the requested result";
  const clauses = stageList(goal);
  const singleJob = clauses.length === 1 ? genericCatalogJob(goal) : null;
  const inferred = clauses.length === 1 ? declaredPath(goal, inputs, resources, singleJob) : [];
  const stageFor = (stage) => {
    const job = genericCatalogJob(stage);
    const named = resources.find(resource => mentions(stage, resource.name));
    return named ? { resource: named, stage } : job ? { job, stage } :
      { resource: declaredPath(stage, inputs, resources, null).at(-1), stage };
  };
  const stages = !inferred.length ? (clauses.length ? clauses : [goal]).map(stageFor) :
    [
      ...(singleJob && relates(singleJob.targets.join(" "), inferred[0].input) &&
        !relates(inputs, inferred[0].input) && !inferred.some(resource =>
          relates(singleJob.targets.join(" "), resource.output) && !mentions(goal, resource.name)) ?
        [{ job: singleJob, stage: goal }] : []),
      ...inferred.map(resource => ({ resource, stage: goal })),
    ];
  const steps = [];
  const gaps = [];
  const artifacts = [];

  for (const { stage, job, resource } of stages.slice(0, 5)) {
    if (resource) {
      const prior = artifacts.findLast(artifact => relates(artifact.contract, resource.input));
      if (!prior && !relates(inputs, resource.input)) gaps.push(`Use ${resource.name}: provide or identify ${resource.input} in the executing agent.`);
      steps.push(custom(resource, {
        requires: prior ? [prior.label] : [],
        provides: [resource.output],
        evidence: "Check the declared output format and keep a reference to its input and any gaps.",
      }));
      artifacts.push({ label: resource.output, contract: resource.output });
      continue;
    }
    if (job) {
      const candidates = await lookUp(discover, job.query, job.match);
      if (candidates.length) {
        const [selected] = candidates;
        const required = (selected.requiredInputs || []).map(fieldName).filter(Boolean);
        const fields = resultFields(selected);
        const label = `${job.targets.join(" ")} results from ${selected.id}`;
        const prior = artifacts.findLast(artifact => relates(artifact.contract, (required.length ? required : inputFields(selected)).join(" ")));
        const prerequisite = [...required].filter(field => {
          const use = [inputs, prior?.contract].filter(Boolean).join(" ");
          return !relates(use, field) &&
            !(/(?:url|uri)/i.test(field) && publicUrl(inputs)) &&
            !(/email/i.test(field) && /[^\s@]+@[^\s@]+/.test(inputs));
        });
        steps.push(endpoint(candidates, {
          title: `Get ${job.targets.join(" ")} results`,
          why: "This inspected public catalog action matches the task and returns fields that can be checked before use.",
          input: `${prior ? `The ${prior.label} from the earlier step` : inputs ? "Your supplied inputs" : "The approved values for the lookup"}${required.length ? `, mapped to ${required.join(", ")}` : ""}. Confirm required fields in the endpoint contract.`,
          output: `Documented result fields: ${fields.join(", ")}. Keep source links when available, and distinguish failed or empty results.`,
          instructions: "Open the inspected endpoint contract in your agent. Map the available data to supported fields, and confirm access, data-sharing scope, call limits and cost before executing.",
          requires: prior ? [prior.label] : [],
          provides: [label],
          evidence: "Verify the documented result fields and keep failures and any available source references with the response.",
        }));
        artifacts.push({ label, contract: `${job.targets.join(" ")} ${fields.join(" ")}` });
        if (prerequisite.length || !required.length && !prior && !inputs) gaps.push(`Get ${job.targets.join(" ")} results: supply or confirm ${prerequisite.length ? prerequisite.join(", ") : "the documented endpoint input"}.`);
        continue;
      }
    }
    const label = job ? `${job.targets.join(" ")} results` : `result of operation ${steps.length + 1}`;
    const title = job ? `Choose a method for ${job.targets.join(" ")}` : `Specify a method for operation ${steps.length + 1}`;
    steps.push(step({
      kind: "blocked", title,
      input: "The actual input and a compatible tool, skill, or documented local method.",
      output: "A result for this operation with source references and unknowns.",
      why: job ? "No inspected catalog result had a documented contract that matched this operation." :
        "The request does not identify a documented operation that can produce this step's output.",
      instructions: `Resolve this part of the request in your agent: ${stage || outcome}. Confirm what the method accepts and returns before running it.`,
      provides: [label],
    }));
    artifacts.push({ label, contract: job?.targets.join(" ") || "" });
    gaps.push(`${title}: ${job ? "no compatible inspected endpoint was found" : "specify the input, expected output, and available tool or skill"}.`);
  }
  for (const skipped of stages.slice(5)) gaps.push(`Additional requested operation not in this draft: ${skipped.resource?.name || skipped.stage}. Split the recipe to plan that operation.`);

  const last = steps.at(-1);
  steps.push(step({
    title: "Check and hand off the result",
    input: `The result of ${last.title} and its underlying sources.`,
    output: last.kind === "custom" ? `A checked result in the declared format: ${last.output}` :
      "A reviewable result in the requested format, with source references and unresolved items visible.",
    why: "Checking against the original request and source evidence makes the result usable rather than just a raw tool response.",
    instructions: `Check the result against this goal: ${outcome}. Confirm the output format, spot-check records or claims against sources, and mark omissions or failures explicitly.`,
    requires: [...(last.provides || [])],
  }));
  return { title: present(goal) ? goal.trim().replace(/[.?!]+$/, "").slice(0, 120) : "Plan the requested workflow", steps, gaps };
}

export async function planCookbook({ useCase, inputs = "", resources = [], discover } = {}) {
  const goal = present(useCase) || "";
  const materials = typeof inputs === "string" ? inputs.trim() : "";
  const declarations = Array.isArray(resources) ? resources.filter(item => item && ["skill", "tool"].includes(item.kind) &&
    [item.name, item.input, item.output].every(present)).slice(0, 8) : [];
  const context = `${goal}\n${materials}`;
  let draft;
  if (/\b(?:warm (?:contacts?|leads?|prospects?)|(?:contacts?|people|customers?)\s+(?:I|we)\s+(?:already\s+)?know|(?:existing|past|historical)\s+(?:contacts?|conversations?|relationships?)|reconnect)\b/i.test(goal))
    draft = await warmRecipe(goal, materials, declarations, discover);
  else if (/\b(?:transcrib\w*|recordings?|audio|transcripts?|captions?)\b/i.test(context) &&
      /\b(?:transcrib\w*|transcript|brief|template|minutes|summari[sz]\w*|recap|notes|action items)\b/i.test(goal))
    draft = await recordingRecipe(goal, materials, declarations, discover);
  else if (/\b(?:check|verify|validat\w*|confirm|fact.check|support\w*)\b/i.test(goal) &&
      /\b(?:claim|assertion|statement|verify that|check that|verify whether|check whether)\b/i.test(goal) &&
      (/\b(?:company|official|business|organization|website|page|source)\b/i.test(context) || publicUrl(context)))
    draft = await companyRecipe(goal, materials, declarations, discover);
  else draft = await generalRecipe(goal, materials, declarations, discover);
  for (const item of draft.steps) if (item.kind === "custom" && !present(item.resourceSource))
    draft.gaps.push(`${item.title}: identify and verify the source for ${item.resourceName} before use.`);
  return draft;
}

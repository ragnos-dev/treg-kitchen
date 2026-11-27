// Only public capability terms may leave this process in a catalog-only search.
const vocabulary = new Set(('search find verify enrich extract scrape crawl summarize transcribe translate generate compare monitor list convert create analyze research discover ' +
  'company companies business businesses contact contacts email address domain website web page text content article articles news keywords ranking seo local maps places reviews products prices stock jobs job postings ' +
  'image images video audio speech transcript transcripts document documents pdf file files data dataset spreadsheet currency weather flight flights hotel hotels property listings real estate sports market markets financial filings social media profiles people location phone number events restaurants').split(' '));

export function catalogIntent(useCase) {
  const words = useCase.toLowerCase().match(/[a-z]+/g) || [];
  if (words.some(word => ['lead', 'leads', 'prospects', 'prospecting'].includes(word))) {
    return { query: 'search people by job title company industry location', leads: true };
  }
  const terms = [...new Set(words.filter(word => vocabulary.has(word)))].slice(0, 12);
  // A generic verb alone gives the catalog too little to match.
  return { query: terms.some(word => !['search', 'find', 'create', 'list', 'generate', 'research', 'discover', 'compare', 'analyze'].includes(word)) ? terms.join(' ') : '', leads: false };
}

export function catalogDraft(intent, candidates) {
  const gaps = [];
  if (!intent.query) gaps.push('What should the tool act on and return? For example, find company websites, verify email addresses, or transcribe audio.');
  else if (!candidates.length) gaps.push('The catalog returned no matching tools. Try a more specific action or input.');
  if (!candidates.length) return { title: 'Narrow the catalog search', steps: [], gaps };

  const describe = (tool) => ({
    endpointId: tool.id,
    why: tool.summary || tool.name || `The catalog returned this endpoint for “${intent.query}”.`,
    input: tool.requiredInputs.length ? 'Required fields: ' + tool.requiredInputs.map(item => item.name).join(', ') : tool.inputNote || 'Review the input options in the linked endpoint.',
    output: tool.outputFields?.length ? 'Documented example fields: ' + tool.outputFields.join(', ') : 'Review the response format in the linked endpoint.',
  });
  const [tool, ...otherTools] = candidates;
  const steps = [];
  if (intent.leads) {
    steps.push({ title: 'Define the prospects you want', endpointId: null, alternatives: [],
      why: 'A target profile gives the search a useful filter and gives you a way to judge the results.',
      input: 'The product or service you sell and an example of a good customer.',
      output: 'A short buyer profile with a role, industry and market.',
      instructions: 'Describe who buys, where they work, and which prospects to exclude.' });
    gaps.push('Which buyer role, industry and location should the search target?');
  }
  steps.push({ ...describe(tool), title: intent.leads ? 'Find matching prospects' : tool.name || tool.id,
    instructions: intent.leads ? 'Map your buyer profile to the supported filters. Start with one search and review the matches before increasing volume.'
      : 'Check the endpoint’s input requirements against what you have. Set the calls per run for the work you intend to do.',
    alternatives: otherTools.map(describe) });
  if (intent.leads) steps.push({ title: 'Shortlist qualified leads', endpointId: null, alternatives: [],
    why: 'Search results need a fit check before they become a usable lead list.',
    input: 'The search results and your buyer profile.', output: 'A deduplicated shortlist with one reason each prospect qualifies.',
    instructions: 'Remove duplicates and record the evidence that each remaining prospect matches the profile.' });
  return { title: intent.leads ? 'Find and qualify new leads' : `Catalog draft: ${intent.query}`, steps, gaps };
}

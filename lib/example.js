// Prewritten demonstration; catalog pricing is attached only after a live read.
export const example = {
  title: "Check a company claim",
  gaps: [],
  steps: [
    {
      title: "Read the source page",
      instructions: "Fetch the public page and return its clean text with the source URL.",
      endpointId: "treg.web.extract",
      endpointUrl: "https://treg.to/catalog/endpoints/treg.web.extract",
      why: "This routed job returns page content and identifies which provider served the request.",
      input: "A public page URL.",
      output: "Page text, page URL, and returned source details.",
      alternatives: [{
        endpointId: "firecrawl.web.scrape",
        endpointUrl: "https://treg.to/catalog/endpoints/firecrawl.web.scrape",
        why: "Choose this provider-specific endpoint when you need direct Firecrawl behavior.",
        input: "A public page URL.",
        output: "Page text and page metadata."
      }]
    },
    {
      title: "Compare the claim with the source",
      instructions: "Quote the exact sentence supporting the claim. Link the page. If the page does not support it, explain the gap and leave the claim unverified.",
      endpointId: null,
      endpointUrl: null,
      why: "This is an evidence and judgment step. The extracted page text provides what is needed without another lookup call.",
      input: "The claim and the returned page text.",
      output: "A cited supporting passage, or an explicit statement that support was not found.",
      alternatives: []
    }
  ]
};

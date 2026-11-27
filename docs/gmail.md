# Gmail handoff for the executing agent

Kitchen makes recipes. It does not connect to Gmail, read a mailbox, import private contacts or execute the recipe. The operator chooses an executing coding agent and grants that agent access separately.

Before using Gmail, the executing agent should:

1. Establish the operator's authorization for the account, purpose, date range and sample size. Reuse authorization already supplied and ask only for missing scope. A recipe alone is not permission to read email or send messages.
2. Discover the operator's existing Gmail connector or approved native CLI account. Reuse that connection and its credential custody. Do not create or reuse an unrelated OAuth client, add authorized domains, request broader scopes or copy tokens into Kitchen.
3. Search a bounded window of sent history, then inspect a bounded number of relevant threads. Start with the operator's approved limits, for example the last year and at most 40 threads. Record inspected, capped and failed coverage separately. Do not treat that sample as the entire mailbox.
4. Qualify warm-contact candidates from actual two-way exchanges. Prefer incoming replies whose `In-Reply-To` or `References` headers link to an earlier sent message addressed to the correspondent. Exclude newsletters, list mail, bulk senders, automated replies and no-reply addresses. A sender appearing in the inbox or a single outbound message is insufficient. If the connector omits reply evidence, report the gap rather than inventing it.
5. Keep a small private evidence record: contact identity, thread reference, reply date and why the exchange qualifies. Review buyer fit, current relevance and any outreach constraints separately. A reply is not consent to future outreach. Preserve the operator's account and client boundaries.

Use the executing agent's native Gmail search and thread-read tools. If the approved environment already provides `gog`, explicit-account metadata reads are available through `gog gmail messages search` and `gog gmail get --format=metadata`; inspect that installation's help before use. Keep credentials with the approved connector or CLI. Handle any required attended authorization in that environment, outside Kitchen.

Private message bodies, contact records and evidence stay in the executing environment or the owner's approved private project home. Never submit them to Kitchen's use-case field, public catalog queries or a planning model by implication. Drafting, creating mailbox artifacts and sending email each require the operator's applicable authorization. This handoff grants none of those actions.

No mailbox was accessed to prepare this document. Native CLI help and official documentation were inspected only. Google's [message-search documentation](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list) and [thread metadata documentation](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.threads/get) describe the underlying read operations; the executing connector's actual capabilities and approved scopes determine what it can prove.

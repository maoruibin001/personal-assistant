# Personal Assistant Dispatcher

An English-language dispatcher core for personal assistants. It answers simple messages locally, uses a host-supplied model for other turns, and returns proposals for delegation or follow-up. It supports optional delivery evidence and source-checked proposals for the assistant's own views.

## Run locally

Requires Node.js 22 or later.

```sh
npm ci
npm test
```

## Integrate with a host

Build with npm run build and import inboundAnswer. The model adapter receives the bounded prompt and system contract and returns parsed JSON with model metadata. This example uses a local fixture and makes no network calls.

```js
import { inboundAnswer } from "./dist/runtime/inbound-answer.js";

const result = await inboundAnswer({
  version: 1,
  test: true,
  message: "Ask the review agent to check the draft.",
  context: [],
  facts: {},
}, {
  run: async (prompt, system, timeoutMs, effort) => ({
    value: {
      reply: "This draft needs a review.",
      needsManagement: true,
      followup: { mode: "delegate_main", topic: "Review the draft" },
    },
    model: "example-fixture",
    turns: 1,
    raw: {},
  }),
});

console.log(result.reply);
console.log(result.followup);
```

Supply runImages for image inputs and readEvidence for bounded delivery-record lookups. A host can pass personaAnswerSystem(customPrompt) as systemText to customize presentation while retaining the output contract. Keep account credentials, persona configuration, memory and message history in the host environment.

The host authenticates incoming events, filters facts before model calls, validates proposed targets, authorizes and executes work, and delivers replies. It also owns persistence and independent review of any proposed views. Treat model output as untrusted and never use a proposal as proof that an action occurred. This repository contains the dispatcher library; messaging gateways and desktop integrations are host responsibilities.

Licensed under the MIT License. The dispatcher core is adapted from Persona Agent Kit.

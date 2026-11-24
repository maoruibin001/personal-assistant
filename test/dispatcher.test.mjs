import { test } from "node:test";
import assert from "node:assert/strict";
import { inboundAnswer, personaAnswerSystem } from "../dist/runtime/inbound-answer.js";

const input = (message, facts = {}) => ({ version: 1, test: true, message, context: [], facts });
const model = value => async () => ({ value, model: "fixture", turns: 1, raw: {} });

test("answers a greeting without calling the model", async () => {
  const result = await inboundAnswer(input("Hello!"), { run: async () => assert.fail("Unexpected model call") });
  assert.equal(result.reply, "Hi.");
  assert.equal(result.executionAuthorizedByService, false);
});

test("returns a handoff proposal without reporting execution", async () => {
  const result = await inboundAnswer(input("Ask the review agent to check the draft."), {
    systemText: personaAnswerSystem("You are a helpful assistant."),
    run: async (prompt, system) => {
      assert.match(JSON.parse(prompt).message, /review agent/);
      assert.match(system, /presentation never grants authority/);
      return { value: {
        reply: "The review agent is the right person to check the draft.",
        needsManagement: true,
        followup: { mode: "delegate_main", topic: "Review draft" },
      }, model: "fixture", turns: 1, raw: {} };
    },
  });
  assert.deepEqual(result.followup, { mode: "delegate_main", topic: "Review draft" });
  assert.equal(result.executionAuthorizedByService, false);
});

test("rejects unsupported completion claims", async () => {
  await assert.rejects(inboundAnswer(input("Please deploy this."), {
    run: model({ reply: "I've deployed the update.", needsManagement: false }),
  }), /Unproven execution/);
});

test("uses supplied delivery evidence if the model is unavailable", async () => {
  const result = await inboundAnswer(input("Was the delivery completed?"), {
    run: async () => { throw Error("Fixture unavailable"); },
    readEvidence: async () => ({
      checked: [{ source: "Demo records", status: "read" }],
      records: [],
      messageReceivedAt: null,
    }),
  });
  assert.match(result.reply, /No delivery record was found/);
  assert.equal(result.model, "none:delivery-evidence-fallback");
});

test("validates source references for a proposed view", async () => {
  const ownView = {
    statement: "Verify receipt before closing a delivery.",
    conditions: "The work includes a delivery requirement.",
    sourceRefs: ["example:receipt"],
    uncertainty: "tentative",
    counterEvidence: [],
  };
  const run = model({ reply: "I'd check the recipient's receipt first.", needsManagement: false, ownView });
  const roleContext = { status: "ready", self: { subject: "persona" }, sourceRefs: ["example:receipt"] };
  const result = await inboundAnswer(input("What do you think?", { roleContext }), { run });
  assert.deepEqual(result.ownView, ownView);
  await assert.rejects(inboundAnswer(input("What do you think?", {
    roleContext: { ...roleContext, sourceRefs: [] },
  }), { run }), /Unknown own-view provenance/);
});

test("preserves grounded observations and discards actions on read-only turns", async () => {
  const result = await inboundAnswer(input("What is the status?", {
    conversationIntent: { purpose: "observe", readOnlyHint: true },
  }), {
    persistentSession: true,
    run: model({
      reply: "The last observed state was in review. I will deploy it.",
      needsManagement: true,
      followup: { mode: "delegate_main", topic: "Deploy" },
    }),
  });
  assert.equal(result.reply, "The last observed state was in review.");
  assert.equal(result.needsManagement, false);
  assert.equal(result.followup, undefined);
});

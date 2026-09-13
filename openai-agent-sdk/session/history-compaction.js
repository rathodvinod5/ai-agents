import "dotenv/config";
import {
  Agent,
  run,
  OpenAIResponsesCompactionSession,
  MemorySession,
} from "@openai/agents";

const agent = new Agent({
  name: "Travel agent",
  instructions: "Answer briefly and keep track of prior context.",
  model: "gpt-5.4",
});

async function testHistoryCompaction() {
  const session = new OpenAIResponsesCompactionSession({
    underlyingSession: new MemorySession(),
    model: "gpt-5.4",
    shouldTriggerCompaction: ({ compactionCandidateItems }) => {
      return compactionCandidateItems.length >= 12;
    },
  });

  let result = await run(agent, "Summarize order #8472 in one sentence.", {
    session,
  });
  let history = await session.getItems();
  console.log("history 1: ", history);

  result = await run(agent, "Remind me of the shipping address.", { session });
  history = await session.getItems();
  console.log("history 2: ", history);

  await session.runCompaction({ force: true });
  history = await session.getItems();
  console.log("history 3: ", history);
}

testHistoryCompaction().catch((err) => console.log("ERR: ", err));

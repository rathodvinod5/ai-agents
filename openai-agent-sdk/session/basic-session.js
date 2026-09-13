import "dotenv/config";
import OpenAI from "openai";
import {
  Agent,
  OpenAIConversationsSession,
  run,
  MemorySession,
} from "@openai/agents";

async function basicSession() {
  const travelAgent = new Agent({
    name: "Travel Agent",
    instructions:
      "You are the travel agent, Answer user queries in a compact way",
  });

  const session = new OpenAIConversationsSession();
  let query = "Where is the Golden gate bridge located?";
  let result = await run(travelAgent, query, {
    session,
  });
  console.log("First result: ", result?.finalOutput);

  query = "What state is it in?";
  result = await run(travelAgent, query, {
    session,
  });
  console.log("Second result: ", result?.finalOutput);
}
// basicSession().catch((err) => console.error("ERR: ", err));

async function testMemorySession() {
  const travelAgent = new Agent({
    name: "TourGuide",
    instructions: "Answer with compact travel facts.",
  });

  const memorySession = new MemorySession();

  let result = await run(
    travelAgent,
    "What city is the Golden Gate Bridge in?",
    {
      session: memorySession,
    },
  );
  console.log("First result: ", result?.finalOutput);

  result = await run(travelAgent, "What state is it in?", {
    session: memorySession,
  });
  console.log("Second result: ", result?.finalOutput);
}
// testMemorySession().catch((err) => console.error("ERR: ", err));

async function getAndSetSessionItems() {
  const conversation = await new OpenAI().conversations.create({});
  console.log("conversationId ", conversation.id);

  const session = new OpenAIConversationsSession({
    conversationId: conversation.id,
  });
  let history = await session.getItems();
  console.log("History length: ", history);

  const item = [
    {
      role: "user",
      type: "message",
      content: [{ type: "input_text", text: "Let’s continue later." }],
    },
  ];
  await session.addItems(item);
  history = await session.getItems();
  console.log("History length: ", history);

  const poppedItem = await session.popItem();
  console.log("Popped item: ", poppedItem);
  history = await session.getItems();
  console.log("History: ", history);
}
getAndSetSessionItems().catch((err) => console.error("ERR: ", err));

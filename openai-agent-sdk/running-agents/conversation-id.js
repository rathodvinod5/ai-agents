import "dotenv/config";
import { OpenAI } from "openai";
import { Agent, run } from "@openai/agents";

const agent = new Agent({
  name: "Assistenct",
  instructions: "Reply very concisely",
});

async function testWithConversationId() {
  const client = new OpenAI();
  const { id: conversationId } = await client.conversations.create({});

  let query = "What city is the Golden Gate Bridge in?";
  const first = await run(agent, query, {
    conversationId,
  });
  console.log("First Response: \n", first?.finalOutput);

  query = "What state is it in?";
  const second = await run(agent, query, {
    conversationId,
  });
  console.log("Second Response: \n", second?.finalOutput);
}
// testConversationId().catch((err) => console.log("ERR: ", err));

async function testWithLastConversationId() {
  const client = new OpenAI();

  let query = "What city is the Golden Gate Bridge in?";
  const first = await run(agent, query);
  console.log("First Response: \n", first?.finalOutput);
  const previousResponseId = first?.lastResponseId;

  query = "What state is it in?";
  const second = await run(agent, query, {
    previousResponseId,
  });
  console.log("Second Response: \n", second?.finalOutput);
}
testWithLastConversationId().catch((err) => console.log("ERR: ", err));

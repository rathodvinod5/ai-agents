import "dotenv/config";
import { Agent, tool, run } from "@openai/agents";

const orderAgent = new Agent({
  name: "OrderAgent",
  instructions: `You are responsible for handling customer order questions.
    Always investigate the order before answering.
    For shippped orders, provide the lates shipping info`,
});

const orderAgentTool = orderAgent.asTool({
  name: "order_agent",
  description: `Handles customer oder questions including order status and shipment tracking.`,
  onStream: (event) => {
    // Strean method is called when this tool calls orderAgent
    // console.log(`[Order Agent] ${event.event.type}`);

    const type = event.event.type;

    if (type === "run_item_stream_event") {
      console.log("Order agent produced a run item");
    }

    if (type === "raw_model_stream_event") {
      console.log("Order agent model streamed data");
    }

    if (type === "agent_updated_stream_event") {
      console.log("Order agent state changed");
    }
  },
});

const supportAgent = new Agent({
  name: "Support Orchestrator",
  instructions: `
    You are a customer support orchestrator.
    For order-related questions, delegate the work
    to order_agent.
    Do not answer order questions without consulting
    the order agent.
    `,
  tools: [orderAgentTool],
});

async function testStreamingAgent() {
  const result = await run(supportAgent, "Where is my order ORD-1001?");

  console.log("\nFINAL ANSWER:");
  console.log(result.finalOutput);
}
testStreamingAgent().catch((err) => console.log("ERR: ", err));

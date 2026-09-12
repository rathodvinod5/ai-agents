import "dotenv/config";
import { Agent, run, tool } from "@openai/agents";
import { z } from "zod";
import readline from "node:readline/promises";

// --------------------------------------------------
// Fake database
// --------------------------------------------------

const orders = {
  1234: {
    id: "1234",
    product: "MacBook Pro",
    status: "processing",
  },
};

// --------------------------------------------------
// Tool 1: Get order
// --------------------------------------------------

const getOrder = tool({
  name: "get_order",
  description: "Get information about a customer order.",
  parameters: z.object({
    orderId: z.string(),
  }),
  execute: async ({ orderId }) => {
    const order = orders[orderId];

    if (!order) {
      return `Order ${orderId} was not found.`;
    }

    return JSON.stringify(order);
  },
});

// --------------------------------------------------
// Tool 2: Cancel order
// --------------------------------------------------

const cancelOrder = tool({
  name: "cancel_order",
  description: "Cancel a customer order.",
  parameters: z.object({
    orderId: z.string(),
  }),

  // IMPORTANT
  needsApproval: true,

  execute: async ({ orderId }) => {
    const order = orders[orderId];

    if (!order) {
      return `Order ${orderId} was not found.`;
    }

    if (order.status === "cancelled") {
      return `Order ${orderId} is already cancelled.`;
    }

    order.status = "cancelled";

    return `Order ${orderId} has been cancelled successfully.`;
  },
});

// --------------------------------------------------
// Agent
// --------------------------------------------------

const agent = new Agent({
  name: "Customer Support Agent",

  instructions: `
You are an e-commerce customer support agent.

You can:
- Look up orders.
- Cancel orders.

When a user asks to cancel an order:
1. Look up the order first.
2. If it exists, cancel it.
3. The cancellation tool requires human approval.
4. After cancellation, clearly tell the customer the result.
`,

  tools: [getOrder, cancelOrder],
});

// --------------------------------------------------
// Simple terminal confirmation
// --------------------------------------------------

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function askForApproval(interruption) {
  console.log("\n⚠️ HUMAN APPROVAL REQUIRED");

  console.log(`Agent: ${interruption.agent.name}`);
  console.log(`Tool: ${interruption.name}`);
  console.log(`Arguments: ${interruption.arguments}`);

  const answer = await rl.question("\nAllow this action? (y/n): ");

  return answer.toLowerCase() === "y";
}

// --------------------------------------------------
// Run agent with streaming
// --------------------------------------------------

async function main() {
  let stream = await run(agent, "Please cancel order #1234", {
    stream: true,
  });

  // Stream normal assistant output
  stream
    .toTextStream({
      compatibleWithNodeStreams: true,
    })
    .pipe(process.stdout);

  // Wait until this streaming run finishes/pauses
  await stream.completed;

  // ----------------------------------------------
  // Handle human approval
  // ----------------------------------------------

  while (stream.interruptions?.length) {
    const state = stream.state;

    for (const interruption of stream.interruptions) {
      const approved = await askForApproval(interruption);

      if (approved) {
        console.log("\n✅ Approved");
        state.approve(interruption);
      } else {
        console.log("\n❌ Rejected");
        state.reject(interruption);
      }
    }

    // --------------------------------------------
    // Resume the SAME run
    // --------------------------------------------

    stream = await run(agent, state, {
      stream: true,
    });

    stream
      .toTextStream({
        compatibleWithNodeStreams: true,
      })
      .pipe(process.stdout);

    await stream.completed;
  }

  console.log("\n\nDone.");

  rl.close();
}

main().catch(console.error);

import "dotenv/config";
import { Agent, run, tool } from "@openai/agents";
import { z } from "zod";
import readline from "node:readline/promises";

const status = Object.freeze({
  PLACED: "order-placed",
  PROCESSING: "processing",
  TRANSIT: "in-transit",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
});

const orders = {
  1234: {
    name: "AI Hands-on",
    category: "Books",
    status: status.PLACED,
  },
};

const getOrderInfo = tool({
  name: "get_order_info",
  description: "Get the information about the order.",
  parameters: z.object({
    orderId: z.string(),
  }),
  execute: ({ orderId }) => {
    if (!orders[orderId]) {
      return `Order ${orderId} not found`;
    }

    return orders[orderId];
  },
});

const cancelOrder = tool({
  name: `cancel_order`,
  description: "Cancel a customer order",
  needsApproval: true,
  parameters: z.object({
    orderId: z.string(),
  }),
  execute: ({ orderId }) => {
    if (!orders[orderId]) {
      return `Order ${orderId} not found`;
    }

    const order = orders[order];

    if (order.status === status.CANCELLED) {
      return `Order #${orderId} is already cancelled`;
    } else if (order.status !== status.TRANSIT) {
      return `Order #${orderId} cannot be cancelled because currently it is in transit mode`;
    }

    orders[orderId].status = status.CANCELLED;

    return `Your order #${orderId} has been cancelled successfully`;
  },
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function askForApproval(interruption) {
  console.log("\n⚠️ HUMAN APPROVAL REQUIRED");
  console.log("Agent: ", interruption?.agent.name);
  console.log("Tool: ", interruption?.name);
  console.log("Arguments: ", interruption?.arguments);

  // const answer = await rl.question(
  //   "\nDo you want to cancel the order? Press (y/n): ",
  // );
  // return answer.toLowerCase() == "y";

  const answer = await rl.question("\nAllow this action? (y/n): ");

  return answer.toLowerCase() === "y";
}

const customerSupportAgent = new Agent({
  name: "Customer support agent",
  instructions: `You are the cusomer support agent for cancelling the orders.
    Your task is to
    - Look up orders
    - Cancel the user's order/orders

    When the user asks to cancel the order
    - Look up for the order information
    - Cancel the order if it exists
    - The canellation process requires human approval
    - Acknowledge the user clearly about the result
    `,
  tools: [getOrderInfo, cancelOrder],
});

async function main() {
  const query = "Can you please cancel my order #1234?";
  let streams = await run(customerSupportAgent, query, {
    stream: true,
  });

  streams
    .toTextStream({ compatibleWithNodeStreams: true })
    .pipe(process.stdout);

  await streams.completed;

  while (streams?.interruptions?.length) {
    const state = streams?.state;

    for (const interruption of streams?.interruptions) {
      //   console.log("interruption: ", interruption);
      const isApproved = await askForApproval(interruption);
      if (isApproved) {
        console.log("\n✅ Approved");
        state.approve(interruption);
      } else {
        console.log("\n❌ Rejected");
        state.reject(interruption);
      }
    }

    streams = await run(customerSupportAgent, state, {
      stream: true,
    });
    streams
      .toTextStream({ compatibleWithNodeStreams: true })
      .pipe(process.stdout);
    await streams.completed;
  }

  rl.close();
}
main().catch((error) => console.log("ERR: ", error));

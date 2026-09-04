import "dotenv/config";
import { Agent, run, tool } from "@openai/agents";
import { z } from "zod";

// ======================== Define agents =======================
const orderAgent = new Agent({
  name: "OrderAgent",
  model: "gpt-4o-mini",
  instructions: `You are an order support specialist. 
    You can lookup order status, shipping details and delivery estimates. 
    Always ask for the order id if not provided. 
    Explain delays clearly and offer next steps.`,
});

const refunAgent = new Agent({
  name: "RefundAgent",
  model: "gpt-4o-mini",
  instructions: `You are a refund specialist.
    Check refund eligibility based on order status and policy.
    Explain options: full refund partial refund, store credits.
    If eligible confirm details before 'processing the refund'.
    `,
});

const catalogAgent = new Agent({
  name: "CatalogAgent",
  model: "gpt-4o-mini",
  instructions: `You are a product and catalog specialist.
  Answer questions about collections, launch dates, sizes, colors and availability.
  If you don't know the exact date, give the best estimates and tell the user 
  where to check for the updates`,
});

const triageAgent = new Agent({
  name: "TriageAgent",
  model: "gpt-4o-mini",
  instructions: `You are a front-desk for an e-commerce support chat.
  Read the user's message and decide which specialist should handle it.
  Use
  - Order agent: Order issues, tracking, delays
  - Refund agent: refunds, returns, charges
  - Catelog agent: products, collections, launch dates
  
  If the user asks multiple unrelated things, pick the most urgent on and handoff.
  Use handoffs to transfer the conversation to the chosen specialist.`,
  handoff: [orderAgent, refunAgent, catalogAgent],
  handoffDescription: `You can transfer the conversation to specialist:
  orderAgent for order/tracking issues,
  refundAgent for refund/returns
  catalogAgent for product/collection questions.
  `,
});

// ============================ Lifecycle hooks =============================
triageAgent.on("agent_start", (ctx, agent) => {
  console.log(`${agent.name} agent started`);
});
triageAgent.on("agent_handoff", (ctx, agent) => {
  console.log(`handingoff to ${agent.name} agent`);
});

orderAgent.on("agent_start", (ctx, output) => {
  console.log(`${orderAgent.name} agent started`);
});
orderAgent.on("agent_end", (ctx, output) => {
  console.log(`${orderAgent.name} has finished execution.`);
});

refunAgent.on("agent_start", (ctx, output) => {
  console.log(`${refunAgent.name} agent started`);
});
refunAgent.on("agent_end", (ctx, output) => {
  console.log(`${refunAgent.name} has finished execution.`);
});

catalogAgent.on("agent_start", (ctx, output) => {
  console.log(`${catalogAgent.name} agent started`);
});
catalogAgent.on("agent_end", (ctx, output) => {
  console.log(`${catalogAgent.name} has finished execution.`);
});

// ======================= Test basic agents ===============================
async function testAgents() {
  const userMessage = `My order #12345 is 5 days late. I want a refund, 
  and also when does the winter collection drop?`;
  const result = await run(triageAgent, userMessage);
  if (result?.finalOutput) {
    console.log("Output: ", result.finalOutput);
  } else {
    console.log("No output");
  }
}
// testAgents().catch((err) => console.log("Err: ", err));

// ========================= Define tools ==========================
const orderTool = tool({
  name: "order_tool",
  description: `Ask the order specialist about an order's status, shipping and delays.`,
  parameters: z.object({
    orderId: z.string().describe("The ID of the order ex: '1245'"),
    issue: z
      .string()
      .describe("The user defined issue about the product/order"),
  }),
  execute: async ({ orderId, issue }) => {
    const prompt = `Order ID: ${orderId}\nUser Issue: ${issue}`;
    const status = await run(orderAgent, prompt);
    return status.finalOutput;
  },
});

const refundTool = tool({
  name: "refund_tool",
  description: `Ask the refund specialist about wether a refund is possible and what options exists`,
  parameters: z.object({
    orderId: z.string().describe("The ID of the order ex: '1245'"),
    situation: z
      .string()
      .describe("Why the user wants a refund (ex: late delivery)."),
  }),
  execute: async ({ orderId, situation }) => {
    const prompt = `
    OrderId: ${orderId}
    Situation: ${situation}

    Explain refund eligibilty and options
    `;
    const status = await run(refundAgent, prompt);
  },
});

const catalogTool = tool({
  name: "catalog_tool",
  description: `Ask catalog specialist about collections, launch date and product availability`,
  parameters: z.object({
    question: z.string().describe("Product/catalog related questions"),
  }),
  execute: async ({ question }) => {
    const status = await run(catalogAgent, question);
    return status.finalOutput;
  },
});

const supportManager = new Agent({
  name: "SupportManager",
  instructions: `You are the main customer support agent for an e‑commerce store.
    For each user message:
    1) Identify all distinct topics (order status, refund, product info, etc.).
    2) For each topic, call the appropriate tool (check_order, evaluate_refund, ask_catalog).
    3) Combine the tool outputs into one clear, friendly answer.
    Do not expose internal tool calls; just present a cohesive response.`,
  tools: [orderTool, refundTool, catalogTool],
});

async function testAgentsWithTools() {
  const userMessage = `My order #12345 is 5 days late. I want a refund, 
    and also when does the winter collection drop?`;
  console.log("\nPrompt: ", userMessage);

  const result = await run(supportManager, userMessage);
  if (result.finalOutput) {
    console.log("\nFinal output: ", result.finalOutput);
  } else {
    console.log("No output");
  }
}
testAgentsWithTools().catch((err) => console.log("ERR: ", err));

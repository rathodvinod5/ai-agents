import "dotenv/config";
import { Agent, run, tool } from "@openai/agents";
import { z } from "zod";

// Agent context
async function contextExample() {
  const contextAgent = new Agent({
    name: "Personal shopper",
    instructions: "Recommend products the user will love.",
  });

  const query = "Find me a new pair of running shoes";
  const result = await run(contextAgent, query, {
    context: {
      uid: "abc",
      isProUser: true,
      fetchPurchases: async () => [],
    },
  });
  const finalOutput = result.state._currentStep;
  if (finalOutput?.output) {
    console.log("Output: ", finalOutput.output);
  } else {
    console.log("No output: ");
  }
}
// contextExample().catch((err) => console.log("ERR: ", err));

// Agent with output schema
async function agentWithSchema() {
  const eventSchema = z.object({
    name: z.string().describe("Then name of the event"),
    date: z.string().describe("The date on which the event will run"),
    participants: z
      .array(z.string())
      .describe("The number of people who are atteding the event"),
  });

  const eventAgent = new Agent({
    name: "Event Agent",
    instructions: `Extract calendar events precisley from the given user's text.`,
    outputType: eventSchema,
  });

  const userQuery =
    "Hey, let's schedule a Project Sync with Sarah and Mike tomorrow on October 15th.";

  const result = await run(eventAgent, userQuery);
  if (result?.finalOutput) {
    console.log("Final output: ", result.finalOutput);
  } else {
    console.log("No output");
  }
}
// agentWithSchema().catch((err) => console.log("ERR: ", err));

// Manager/agent as tool
async function managerAsTool() {
  const bookingAgent = new Agent({
    name: "Booking Agent",
    instructions: `Answer booking questions an modify the reservations.`,
  });
  const refundAgent = new Agent({
    name: "Refund Agent",
    instructions: `Hepl customers process refund and credits.`,
  });

  const managerAgent = new Agent({
    name: "Customer facing agents",
    instructions: `Answer the user's query about booking and refund 
      and handoff to the specific tools`,
    tools: [
      bookingAgent.asTool({
        toolName: "BookingAgent",
        toolDescription: "Handles booking questions and requests",
      }),
      refundAgent.asTool({
        toolName: "RefundAgent",
        toolDescription: "Handles refund questions and requests",
      }),
    ],
  });

  const query = `Hey, I need to cancel my reservation and get my money back. 
   1) Reservation number: 12345
   2) Name: Bob
   3) Email: user@abc.com
   `;
  const result = await run(managerAgent, query);
  if (result?.finalOutput) {
    console.log("Result: ", result.finalOutput);
  } else {
    console.log("No output");
  }
}
// managerAsTool().catch((err) => console.log("ERR: \n", err));

// Dynamic instructions
async function dynamicInstructions(runContext) {
  const { name, tier, location } = runContext.context;

  let instructions = `You are Personal assistent, please answer the user 
    query effectively`;
  if (tier == "pro") {
    instructions += `\n- The user is a premium tier subscriber. 
      Provide deep, comprehensive, and advanced details.`;
  } else {
    instructions += `\n- The user is on the free tier. Keep answers 
      concise and remind them briefly about upgrading if appropriate.`;
  }
  return instructions;
}

async function dynamicInstructionsDemo() {
  const agent = new Agent({
    name: "Personal agent",
    instructions: dynamicInstructions,
    model: "gpt-4o-mini",
  });

  let query = "Explain me in short, what is PDA in Solana?";
  let result = await run(agent, query, {
    context: {
      name: "John Doe",
      location: "Pune, India",
      tier: "pro",
    },
  });
  if (result.finalOutput) {
    console.log("Pro ouput: ", result.finalOutput);
  } else {
    console.log("No output");
  }

  let freeQuery = "Can you explain quantum computing briefly?";
  const freeResult = await run(agent, freeQuery, {
    context: {
      name: "Bob",
      tier: "free",
      location: "London",
    },
  });
  if (freeResult.finalOutput) {
    console.log("Free ouput: ", freeResult.finalOutput);
  } else {
    console.log("No output");
  }
}
// dynamicInstructionsDemo().catch((error) => console.log("Error: ", error));

async function agentLifeCycleHooks() {
  const historyTool = tool({
    name: "HistoryTool",
    description: "Give me some fun fact about the history",
    parameters: z.object(),
    execute: () => "Sharks are older then trees",
  });
  const historyAgent = new Agent({
    name: "History Agent",
    instructions: `You provide assistant with the historical queries, 
      Explain the important events clearly and concisely`,
    tools: [historyTool],
  });

  const calculatorTool = tool({
    name: "CalculatorTool",
    description: "Please add two numbers return the result",
    parameters: z.object({
      left: z.number(),
      right: z.number(),
    }),
    execute: async ({ left, right }) => left + right,
  });
  const billingAgent = new Agent({
    name: "Billing Agent",
    instructions: `You are a accounting specialist, Use CalculatorTool 
      to calculate outstanding bills`,
    tool: [calculatorTool],
  });

  const triageAgent = Agent.create({
    name: "Triage Agent",
    instructions: `Determine the user query. If it involves math or math billing,
      hand off to the Billing Agent. If it involves any history info, handoff to 
      the History Agent`,
    handoffs: [billingAgent, historyAgent],
  });

  triageAgent.on("agent_start", (ctx, agent) => {
    console.log(`${agent.name} agent started`);
  });
  triageAgent.on("agent_handoff", (ctx, agent) => {
    console.log(`handingoff to ${agent.name} agent`);
  });

  billingAgent.on("agent_tool_start", (ctx, toolInstance, { toolCall }) => {
    console.log(
      `[Lifecycle] ${billingAgent.name} is running tool: "${toolInstance.name}" with arguments:`,
    );
  });

  billingAgent.on(
    "agent_tool_end",
    (ctx, toolInstance, result, { toolCall }) => {
      console.log(
        `Tool "${toolInstance.name}" execution complete. Result returned: "${result}"`,
      );
    },
  );
  billingAgent.on("agent_end", (ctx, output) => {
    console.log(`${billingAgent.name} has finished execution.`);
  });

  const myAppContext = {
    logger: (message) => console.log(`[APP LOG] ${message}`),
  };

  // let userQuery = `Hi, I need to know what 455 plus 545 is for my billing invoice.`;
  // let result = await run(triageAgent, userQuery, {
  //   context: myAppContext,
  // });
  // if (result.finalOutput) {
  //   console.log("Final output: ", result.finalOutput);
  // } else {
  //   console.log("No output");
  // }

  let userQuery = `Hi, tell me something about history, specially about sharks`;
  let result = await run(triageAgent, userQuery, {
    context: myAppContext,
  });
  if (result.finalOutput) {
    console.log("Final output: ", result.finalOutput);
  } else {
    console.log("No output");
  }
}
agentLifeCycleHooks().catch((error) => console.log("ERR: ", error));

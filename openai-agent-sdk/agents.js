import "dotenv/config";
import { Agent, run } from "@openai/agents";
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

  let query = "Can you explain quantum computing briefly?";
  const freeResult = await run(agent, query, {
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
dynamicInstructionsDemo().catch((error) => console.log("Error: ", error));

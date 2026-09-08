import "dotenv/config";
import {
  Agent,
  run,
  tool,
  InputGuardrailTripwireTriggered,
} from "@openai/agents";
import { z } from "zod";

const mathHomeworkAgent = new Agent({
  name: "Guardrail check",
  instructions: "Check if the user is asking you to do their math homework.",
  model: "gpt-4o-mini",
  outputType: z.object({
    isMathHomework: z.boolean(),
    reasoning: z.string(),
  }),
});

const mathGuardRail = {
  name: "Math Homework Guardrail",
  runInParallel: false,
  execute: async ({ input, context }) => {
    const status = await run(mathHomeworkAgent, input, { context });

    return {
      outputInfo: status?.finalOutput,
      tripwireTriggered: status?.finalOutput?.isMathHomework ?? false,
    };
  },
};

const agent = new Agent({
  name: "Customer Support Agent",
  instructions: `You are a customer support agent. You help customers with their questions.`,
  model: "gpt-4o",
  inputGuardrails: [mathGuardRail],
});

agent.on("agent_start", () => {
  console.log("Main agent called");
});

mathHomeworkAgent.on("agent_start", () => {
  console.log("MathHomeworkAgent agent called");
});

async function testMathInputGuardRail() {
  const query = `Hello, can you help me solve for x: 2x + 3 = 11?`;
  console.log("User query: ", query);

  try {
    const status = await run(agent, query);
    if (status.finalOutput) {
      console.log("\n✅ [Pass] Guardrail cleared.");
      console.log("Agent Response:", status.finalOutput);
    } else {
      console.log("No output");
    }
  } catch (error) {
    if (error instanceof InputGuardrailTripwireTriggered) {
      console.log("\n🚨 [BLOCKED] Math homework guardrail triggered.");
      return;
    }
    console.log("ERROR: ", error);
  }
}

testMathInputGuardRail().catch((error) => {
  console.error(error);
});

import "dotenv/config";
import { Agent, run, OutputGuardrailTripwireTriggered } from "@openai/agents";
import { z } from "zod";

const outputType = z.object({
  response: z.string(),
});

const mathGuardRailsAgent = new Agent({
  name: "OutputMathAgent",
  instructions: "Check if output contains any math",
  outputType: z.object({
    reasoning: z.string(),
    isMath: z.boolean(),
  }),
});

const mathGuardRails = {
  name: "Math output guard rails",
  runInParallel: false,
  execute: async ({ agentOutput, context }) => {
    const status = await run(mathGuardRailsAgent, agentOutput.response, {
      context,
    });
    console.log("status.finalOutput: ", status?.finalOutput);
    return {
      outputInfo: status?.finalOutput,
      tripwireTriggered: status?.finalOutput?.isMath,
    };
  },
};

const customerSupportAgent = new Agent({
  name: "Customer Support agent",
  instructions: `You are a customer facing support agent, Please answer the user's query`,
  outputGuardrails: [mathGuardRails],
  outputType: outputType,
});

async function testOutputGuradRails() {
  const query = "Hey can you solve this math problem please, 2 + 4 * 5";
  try {
    const status = await run(customerSupportAgent, query);
    if (status?.finalOutput) {
      console.log("\n✅ [Pass] Guardrail cleared.");
      console.log("Agent Response:", status.finalOutput);
    } else {
      console.log("No output");
    }
  } catch (error) {
    if (error instanceof OutputGuardrailTripwireTriggered) {
      console.log("\n🚨 [BLOCKED] Math guardrail triggered.");
      return;
    }
  }
}

testOutputGuradRails().catch((err) => console.log("ERR: ", err));

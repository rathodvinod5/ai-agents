import "dotenv/config";
import { Agent, run, tool } from "@openai/agents";
import { z } from "zod";

async function historyAgent() {
  const agent = new Agent({
    name: "History tutor",
    instructions: `You are an history tutor, please provide assitance with historical queries.
      Explain the important events and context clearly.`,
  });
  const result = await run(agent, "When did sharks first appear?");
  const finalStep = result.state._currentStep;
  if (finalStep?.output) {
    console.log("Output: ", finalStep.output);
  } else {
    console.log("No Output: ");
  }
}
// historyAgent().catch((err) => console.log("ERR: ", err));

async function historyAgentWithTools() {
  const historyFunFactTool = new tool({
    name: "historyFunFactTool",
    description: "Give a fun fact about historical event",
    parameters: z.object(),
    execute: () => {
      return "Sharks are older than trees";
    },
  });

  const historyAgent = new Agent({
    name: "History tutor",
    instructions: `You provide assistance with historical queries.
      Explain the important event and context clearly`,
    tools: [historyFunFactTool],
  });
  const historyQuery =
    "Give me some fun facts about historical events, specially about sharks";
  // const result = await run(historyAgent, historyQuery);

  const mathTool = new tool({
    name: "mathTool",
    description: `Solves math expressions following BODMAS`,
    parameters: z.object({
      expression: z.string(),
    }),
    execute:
      () =>
      async ({ expression }) =>
        String(new Function(`return ${expression.replace(/\^/g, "**")}`)()),
  });

  const mathAgent = new Agent({
    name: "Math tutor",
    instructions: `You are an expert Math Tutor. When given an equation, you must always:
      1. Break down the calculation using the BODMAS rule (Brackets, Orders, 
        Division/Multiplication, Addition/Subtraction).
      2. Explicitly call the 'bodmas_math_solver' tool to compute the numbers.
      3. Explain each intermediate step clearly to the user.`,
    tools: [mathTool],
  });
  const mathQuery = "What is the output of 2 - 4 * 3?";
  // const result = await run(mathAgent, mathQuery);
  // const finalStep = result?.state?._currentStep;
  // if (finalStep?.output) {
  //   console.log("Output", finalStep.output);
  // } else {
  //   console.log("No output");
  // }

  const agentsTriage = Agent.create({
    name: "triageAgent",
    instructions: `You determine which specialist agent to use based on 
      the user's homework question. Hand off immediately to the correct tutor`,
    handoffs: [historyAgent, mathAgent],
  });
  const result = await run(agentsTriage, mathQuery);

  console.log("Result: ", result.finalOutput);
}
historyAgentWithTools().catch((err) => console.log("ERR: ", err));

import "dotenv/config";
import { Agent, tool, run, programmaticToolCallingTool } from "@openai/agents";
import { z } from "zod";

const getInventoryTool = tool({
  name: "get_inventory",
  description: `Return inventory for SKU.`,
  parameters: z.object({
    sku: z.string(),
    availableUnits: z.number(),
  }),
  outputSchema: z.object({
    sku: z.string(),
    availableUnits: z.number(),
  }),
  execute: ({ sku }) => {
    return {
      sku,
      availableUnits: 42,
    };
  },
  allowedCallers: ["programmatic"],
});

const getDemandTool = tool({
  name: "get_demand",
  description: `Return requested units of SKU`,
  parameters: z.object({
    sku: z.string(),
    requestedUnits: z.number(),
  }),
  outputSchema: z.object({
    sku: z.string(),
    requestedUnits: z.number(),
  }),
  execute: ({ sku }) => {
    return {
      sku,
      requestedUnits: 30,
    };
  },
  allowedCallers: ["programmatic"],
});

const agent = new Agent({
  name: "InventoryAgent",
  instructions:
    `Use Programmatic Tool Calling to fetch inventory and demand concurrently.
    Return the source values and the calculated shortage in the final answer.`.trim(),
  tools: [getInventoryTool, getDemandTool, programmaticToolCallingTool()],
});

async function testProgrammaticToolCalling() {
  const userQuery =
    "Check the inventory status and demand shortage for SKU 'DESK-LAMP-01'.";
  const result = await run(agent, userQuery);
  if (result.finalOutput) {
    console.log("Result: ", result.finalOutput);
  } else {
    console.log("No output");
  }
}
testProgrammaticToolCalling().catch((err) => console.log("ERR: ", err));

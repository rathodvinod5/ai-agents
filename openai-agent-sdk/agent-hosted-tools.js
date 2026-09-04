import "dotenv/config";
import {
  Agent,
  tool,
  run,
  webSearchTool,
  programmaticToolCallingTool,
} from "@openai/agents";
import { z } from "zod";

const getProtocolNotes = tool({
  name: "get_protocol_notes",
  description: `Fetch internal notes about Solana protocol (validator, DeFi, infra, etc.).
  Use this when the user asks about a specific protocol you might have notes on.`,
  parameters: z.object({
    protocol: z
      .string()
      .describe("Protocol name. Ex: 'Jito', 'Camino', 'Marginfi' etc"),
  }),
  execute: ({ protocol }) => {
    const protocolName = protocol.toLowerCase();
    console.log("Protocol name: ", protocolName);
    switch (protocolName) {
      case "jito":
        return `Jito: MEV infrastructure on Solana. Runs Jito validators, offers 
        liquid staking token (jitoSOL), and MEV‑boosted staking rewards.`;
        break;

      case "camino":
        return `Kamino: lending & liquidity optimizer on Solana. Provides leveraged 
        yield strategies, auto‑compounding LP positions, and isolated lending markets.`;
        break;

      case "marginfi":
        return `MarginFi: cross‑margin trading platform on Solana. Offers isolated 
        & cross‑margin accounts, risk engine, and integrated DEX aggregation.`;
        break;

      default:
        return `No internal notes for ${protocol}; rely on web search for up‑to‑date info.`;
        break;
    }
  },
});

const writeProtocolReport = tool({
  name: "write_protocol_report",
  description: `Given raw research notes about one or more Solana protocol, produce a
  structured JSON report`,
  parameters: z.object({
    notes: z
      .string()
      .describe("Raw research notes from web and internal tools"),
  }),
  execute: async ({ notes }) => {
    return {
      summary: `Structured report on solana protocol based on web + internal notes`,
      details: notes,
      recomendations: `Focus on validation decentralization, MEV sharing models, risks
      and parameters when evaluating these protocols.`,
    };
  },
  outputSchema: z.object({
    summary: z.string(),
    details: z.string(),
    recomendations: z.string(),
  }),
  allowedCallers: ["direct", "programmatic"],
});

const solanaResearchAgent = new Agent({
  name: "SolanaResearchAgent",
  instructions: `You are a solana blockchain research assistant for a blockchain developer.
  Your job is to:
  - Use web serach to get up to date info on protocol, validators, tokenomics and infrastructure.
  - Use get_protocol_notes to fetch any internal notes we have on specific protocols.
  - Optionally use write_protocol_report to produce a structured JSON report once enough
  info is gathered.
  
  You may use programmatic tool calling to cordinate multiple web searches and tool call efficiently.`,
  tools: [
    webSearchTool({ serachContextSize: "medium" }),
    programmaticToolCallingTool(),
    getProtocolNotes,
    writeProtocolReport,
  ],
});

async function testAgentHostedTools() {
  const userQuery = `Compare Jito, Camino, MarginFi from validator/LP/trader perspective.
  Use the web for current info and any internal notes we have. Produce structured comparison
  with recomendations for where to allocate SOL.`;
  const result = await run(solanaResearchAgent, userQuery);
  if (result.finalOutput) {
    console.log("Final Output: ", result.finalOutput);
  } else {
    console.log("No result");
  }
}
testAgentHostedTools().catch((err) => console.log("ERR: ", err));

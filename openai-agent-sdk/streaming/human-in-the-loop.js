import "dotenv/config";

import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { Agent, run, tool } from "@openai/agents";

import { z } from "zod";

// ============================================================
// Fake database
// ============================================================

const accounts = {
  savings: {
    balance: 75000,
  },

  creditCard: {
    balance: 18000,
  },
};

// ============================================================
// Tool 1: Get account balance
// ============================================================

const getBalanceTool = tool({
  name: "get_balance",

  description:
    "Get the current balance of a user's savings or credit card account.",

  parameters: z.object({
    account: z.enum(["savings", "creditCard"]),
  }),

  execute: async ({ account }) => {
    console.log(`\n🔧 TOOL: get_balance(${account})`);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    return {
      account,
      balance: accounts[account].balance,
    };
  },
});

// ============================================================
// Tool 2: Make payment
// ============================================================

const makePaymentTool = tool({
  name: "make_payment",

  description: "Transfer money from savings to pay the user's credit card.",

  parameters: z.object({
    amount: z.number().positive(),
  }),

  // ==========================================================
  // HUMAN-IN-THE-LOOP
  // ==========================================================

  needsApproval: async (_context, { amount }) => {
    // Every payment above ₹10,000 requires human approval.

    return amount > 10000;
  },

  execute: async ({ amount }) => {
    console.log(`\n💳 TOOL: make_payment(₹${amount})`);

    if (amount > accounts.savings.balance) {
      throw new Error("Insufficient savings balance.");
    }

    accounts.savings.balance -= amount;
    accounts.creditCard.balance -= amount;

    await new Promise((resolve) => setTimeout(resolve, 1500));

    return {
      success: true,
      amount,
      remainingSavingsBalance: accounts.savings.balance,
      remainingCreditCardBalance: accounts.creditCard.balance,
    };
  },
});

// ============================================================
// Agent
// ============================================================

const expenseAgent = new Agent({
  name: "Expense Manager",

  instructions: `
You are an AI expense manager.

You help users manage their savings and credit card.

Available operations:

1. Check account balances.
2. Make a payment from savings to credit card.

Rules:

- Always check the relevant balance before making a payment.
- Never invent account balances.
- Explain what you are doing.
- If a payment requires approval, the system will pause the run.
- After approval, continue the operation.
`,

  model: "gpt-4o",

  tools: [getBalanceTool, makePaymentTool],
});

// ============================================================
// Helper: Human approval
// ============================================================

const rl = readline.createInterface({
  input,
  output,
});

async function askHumanApproval(interruption) {
  console.log("\n");
  console.log("======================================");
  console.log("       🚨 HUMAN APPROVAL REQUIRED");
  console.log("======================================");

  console.log(`Agent: ${interruption.agent.name}`);

  console.log(`Tool: ${interruption.name}`);

  console.log(`Arguments: ${interruption.arguments}`);

  console.log("======================================");

  const answer = await rl.question("\nApprove this operation? (y/n): ");

  return answer.trim().toLowerCase() === "y";
}

// ============================================================
// Streaming + Human-in-the-loop
// ============================================================

async function runAgent(userInput) {
  console.log("\n");
  console.log("======================================");
  console.log("USER");
  console.log("======================================");

  console.log(userInput);

  console.log("\n");
  console.log("======================================");
  console.log("AGENT STREAM");
  console.log("======================================\n");

  // ----------------------------------------------------------
  // First run
  // ----------------------------------------------------------

  let stream = await run(expenseAgent, userInput, {
    stream: true,
  });

  // ----------------------------------------------------------
  // Consume streaming events
  // ----------------------------------------------------------

  for await (const event of stream) {
    // Raw model streaming events
    if (event.type === "raw_model_stream_event") {
      const data = event.data;

      // We only display text deltas.
      if (data.type === "response.output_text.delta") {
        process.stdout.write(data.delta);
      }
    }

    // --------------------------------------------------------
    // Tool call events
    // --------------------------------------------------------

    if (event.type === "run_item_stream_event") {
      if (event.item.type === "tool_called_item") {
        console.log("\n\n🔧 Tool called:");

        console.log(event.item.rawItem?.name);
      }

      if (event.item.type === "tool_call_output_item") {
        console.log("\n🔧 Tool completed.");
      }
    }
  }

  // ----------------------------------------------------------
  // IMPORTANT:
  // Wait until the stream has completely finished.
  // ----------------------------------------------------------

  await stream.completed;

  // ----------------------------------------------------------
  // Check for human approval interruptions
  // ----------------------------------------------------------

  while (stream.interruptions?.length) {
    console.log("\n");

    console.log("⏸ Agent execution paused.");

    console.log(`Pending approvals: ${stream.interruptions.length}`);

    // The RunState is what allows us to
    // resume the SAME execution.
    const state = stream.state;

    // --------------------------------------------------------
    // Handle each interruption
    // --------------------------------------------------------

    for (const interruption of stream.interruptions) {
      const approved = await askHumanApproval(interruption);

      if (approved) {
        console.log("\n✅ HUMAN APPROVED");

        state.approve(interruption);
      } else {
        console.log("\n❌ HUMAN REJECTED");

        state.reject(interruption);
      }
    }

    // --------------------------------------------------------
    // Resume the SAME agent run
    // --------------------------------------------------------

    console.log("\n");
    console.log("▶️ Resuming agent...");
    console.log("\n");

    stream = await run(expenseAgent, state, {
      stream: true,
    });

    // --------------------------------------------------------
    // Continue streaming
    // --------------------------------------------------------

    for await (const event of stream) {
      if (event.type === "raw_model_stream_event") {
        const data = event.data;

        if (data.type === "response.output_text.delta") {
          process.stdout.write(data.delta);
        }
      }

      if (event.type === "run_item_stream_event") {
        if (event.item.type === "tool_called_item") {
          console.log("\n\n🔧 Tool called:");

          console.log(event.item.rawItem?.name);
        }
      }
    }

    await stream.completed;
  }

  console.log("\n\n");
  console.log("======================================");

  console.log("FINAL RESULT");

  console.log("======================================");

  console.log(stream.finalOutput);
}

// ============================================================
// Demo
// ============================================================

async function main() {
  await runAgent(
    "Please pay ₹25,000 from my savings account to my credit card.",
  );

  console.log("\n");
  console.log("Final account state:");

  console.log(accounts);

  rl.close();
}

main().catch((error) => {
  console.error("\n❌ Error:", error);

  rl.close();
});

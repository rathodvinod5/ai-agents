import "dotenv/config";
import { Agent, run, tool } from "@openai/agents";
import { z } from "zod";

const EXCEPTIONS = {
  notExpenseRequest: "This request is not related to personal expenses.",
  expensesShouldBeAnArray: "Expenses should be an array of items.",
  expenseAmountIsZero: "Expense amount should be greater than zero.",
  expenseAmountBeyondThreshold:
    "Expense amount should not be greater than 10,00,000.",
  invalidExpenseCategory: "Invalid Expense Category.",
  invalidToolOutput: "The expense calculation produced an invalid result.",
  invalidAssistantOutput: "The assistant produced an invalid response.",
};

const ALLOWED_CATEGORIES = [
  "food",
  "travel",
  "shopping",
  "bills",
  "entertainment",
  "health",
  "education",
  "other",
];

const expenseInputAgent = new Agent({
  name: "Expense Input Agent",
  instructions: `
  You determine whether the user's request is related to
  personal expense calculations.

  Return true ONLY when the request is about:
  - expenses
  - spending
  - costs
  - totals
  - budgets
  - spending categories

  Return false for unrelated requests.
  `,
  outputType: z.object({
    isExpenseRequest: z.boolean(),
    reasoning: z.string(),
  }),
});

const expenseInputGuardrail = {
  name: "Expense Input Guardrail",
  runInParallel: false,
  execute: async ({ input, context }) => {
    const status = await run(expenseInputAgent, input, { context });
    return {
      outputInfo: status?.finalOutput,
      tripwireTriggered: status?.finalOutput?.isExpenseRequest == false,
    };
  },
};

const expenseAgent = new Agent({
  name: "Pesonal Expense Assistant",
  instructions: ``,
  inputGuardrails: [],
  tools: [],
  outputGuardrails: [],
});

async function main() {}

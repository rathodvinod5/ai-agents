import "dotenv/config";
import { Agent, run, tool } from "@openai/agents";
import { z } from "zod";

const expenseInputCheckerAgent = new Agent({
  name: "ExpenseInputCheckerAgent",
  instruction: `You determine whether the user's request is related to 
    personal expense calculations. 
    Return true only when the user is asking about 
    - expense
    - spending
    - const
    - total
    - budgets
    - categories of spending 
    Return false for unrelated requests`,
  outputType: z.object({
    isExpenseRequest: z.boolean(),
    reason: z.string(),
  }),
});

const expenseInputGuardrail = {
  name: "ExpenseInputGuardRail",
  runInParallel: false,
  execute: async ({ input, context }) => {
    const result = await run(expenseInputCheckerAgent, input, { context });
    return {
      outputInfo: result?.finalOutput,
      tripwireTriggered: result?.finalOutput?.isExpenseRequest ?? false,
    };
  },
};

const expensesToolInputGuardrail = {
  name: "ExpesesToolInputGuardrail",
  runInParallel: false,
  execute: ({ input }) => {
    const expenses = input?.expenses;

    if (!Array.isArray(expense)) {
      return {
        outputInfo: {
          reason: "Expenses should be array",
        },
        tripwireTriggered: true,
      };
    }

    const isInvalidAmount = expenses.all(
      (item) => typeof item === "number" && item > 0,
    );
    if (isInvalidAmount) {
      return {
        outputInfo: {
          reason: "expenses should be greater then 0",
        },
        tripwireTriggered: true,
      };
    }

    const isInvalidExpense = expenses.all((item) => item > 1_000_000);
    if (isInvalidExpense) {
      return {
        outputInfo: {
          reason: "Expense should be less then 1000000",
        },
        tripwireTriggered: true,
      };
    }

    return {
      outputInfo: {
        reason: "Expenses are valid",
      },
      tripwireTriggered: false,
    };
  },
};

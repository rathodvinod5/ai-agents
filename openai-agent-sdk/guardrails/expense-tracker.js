import "dotenv/config";
import {
  Agent,
  run,
  tool,
  ToolGuardrailFunctionOutputFactory,
  InputGuardrailTripwireTriggered,
  ToolInputGuardrailTripwireTriggered,
  ToolCallError,
  defineToolInputGuardrail,
  defineToolOutputGuardrail,
} from "@openai/agents";
import { z } from "zod";

const EXCEPTIONS = {
  notExpenseRequest: "This request is not related to personal expenses.",
  expensesShouldBeAnArray: "Expenses should be an array of items.",
  atleasOneExpense: "There should be atleast one expense",
  expenseAmountIsZero: "Expense amount should be greater than zero.",
  expenseAmountBeyondThreshold:
    "Expense amount should not be greater than 10,00,000.",
  categoryIsNotString: "Category is not in string format",
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
  // "other",
];

const QUERY = {
  happyCase: `I spent ₹500 on food and ₹200 on travel. What is my total?`, // done
  invalidCategory: `I went to a pub and spent INR 3000 on alcohol and INR 
  1000 on food. What is my total?`, // done
  invalidAmount: `I spent INR 0 on food. What is my total?`, // done
  thresholdLimitExceeded: `I purchased something for INR 1200000. What is my total?`, // done
  unrelatedQuery: `Write me a JavaScript sorting algorithm.`, // done
  invalidOrgumentJSON: `Tool arguments are not valid JSON.`, // done
};

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

const toolInputGuardrail = defineToolInputGuardrail({
  name: "Tool Input Guardrail",
  runInParallel: false,
  run: async ({ toolCall }) => {
    let expenses = null;

    try {
      const args = await JSON.parse(toolCall.arguments);
      expenses = args.expenses;
    } catch (error) {
      return ToolGuardrailFunctionOutputFactory.throwException({
        reason: EXCEPTIONS.invalidOrgumentJSON,
      });
    }

    console.log("expenses: ", expenses);
    if (!Array.isArray(expenses)) {
      console.log("❌ Expenses is not an array");
      return ToolGuardrailFunctionOutputFactory.throwException(
        EXCEPTIONS.expensesShouldBeAnArray,
      );
    }

    if (expenses.length == 0) {
      console.log("❌ Expenses array is empty");
      return ToolGuardrailFunctionOutputFactory.throwException(
        EXCEPTIONS.atleasOneExpense,
      );
    }

    for (const expense of expenses) {
      if (typeof expense.amount !== "number" || expense.amount <= 0) {
        console.log("❌ Invalid amount:", expense?.amount);
        return ToolGuardrailFunctionOutputFactory.throwException({
          reason: EXCEPTIONS.expenseAmountIsZero,
          expense,
        });
      }

      if (expense.amount >= 1_000_000) {
        console.log("❌ Amount exceeds threshold:", expense.amount);
        return ToolGuardrailFunctionOutputFactory.throwException({
          reason: EXCEPTIONS.expenseAmountBeyondThreshold,
          expense,
        });
      }

      if (typeof expense.category !== "string") {
        console.log("❌ Category is not a string");
        return ToolGuardrailFunctionOutputFactory.throwException({
          reason: EXCEPTIONS.categoryIsNotString,
          expense,
        });
      }

      const category = expense.category.trim().toLowerCase();
      if (!ALLOWED_CATEGORIES.includes(category)) {
        console.log("❌ Invalid category:", category);
        return ToolGuardrailFunctionOutputFactory.throwException({
          reason: EXCEPTIONS.invalidExpenseCategory,
          expense,
        });
      }
    }

    console.log("\n✅ Tool input accepted");
    return ToolGuardrailFunctionOutputFactory.allow();
  },
});

const toolOutputGuardrail = defineToolOutputGuardrail({
  name: "Tool Output Guardrail",
  runInParallel: false,
  run: async ({ output }) => {
    console.log("\nTool Output Guardrail");
    const { total, currency, expenses, expenseCount } = output;
    // console.log("toolOutputGuardrail: ", total, currency);

    if (!output || typeof output !== "object") {
      return ToolGuardrailFunctionOutputFactory.throwException({
        reason: EXCEPTIONS.invalidToolOutput,
      });
    }

    if (typeof total !== "number" || total <= 0) {
      return ToolGuardrailFunctionOutputFactory.throwException({
        reason: EXCEPTIONS.invalidToolOutput,
        problem: "Invalid Total amount",
      });
    }

    if (!Array.isArray(expenses)) {
      return ToolGuardrailFunctionOutputFactory.throwException({
        reason: EXCEPTIONS.invalidToolOutput,
        problem: "Expenses is not an array",
      });
    }

    if (currency !== "INR") {
      return ToolGuardrailFunctionOutputFactory.throwException({
        reason: EXCEPTIONS.invalidToolOutput,
        problem: "Invalid currency",
        currency,
      });
    }

    const expectedTotal = expenses.reduce(
      (sum, expense) => sum + expense.amount,
      0,
    );

    console.log("✅ Tool output accepted");
    return ToolGuardrailFunctionOutputFactory.allow({
      verifiedTotal: expectedTotal,
    });
  },
});

const calculateExpenseTool = tool({
  name: "calculate_expense",
  description: `Calculate the total amount of one or more expenses.

  Each expense must contain:
  - category
  - amount

  Allowed categories are:
  food, travel, shopping, bills,
  entertainment, health, education, other.

  Use this tool whenever the user asks for an
  expense calculation or total.`,
  parameters: z.object({
    expenses: z.array(
      z.object({
        amount: z.number(),
        category: z.string(),
      }),
    ),
  }),
  execute: async ({ expenses }) => {
    const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
    console.log("\nCalculate Expense Tool: ");
    return {
      total,
      expenses,
      currency: "INR",
      expenseCount: expenses.length,
    };
  },
  inputGuardrails: [toolInputGuardrail],
  outputGuardrails: [toolOutputGuardrail],
});

const expenseAgent = new Agent({
  name: "Pesonal Expense Assistant",
  instructions: `You are a personal expense assistant.
  Your job is to:
  - calculate expenses
  - calculate totals
  - summarize expenses

  When the user provides expenses and asks for a calculation,
  call calculate_expense.

  IMPORTANT:
  - Call calculate_expense only when necessary.
  - Once calculate_expense successfully returns a valid result,
    use that result to answer the user.
  - Do NOT call calculate_expense again for the same expenses
    after receiving a valid tool result.
  - Do NOT manually recalculate the total when a valid tool result
    is available.
  - Do NOT invent or change expense categories.

  Use the category exactly as provided by the user.

  For example:
  "₹500 on food" => category "food"
  "₹200 on travel" => category "travel"
  "₹3000 on alcohol" => category "alcohol"

  Do NOT change "alcohol" to "other".

  The tool input guardrail determines whether the category
  is allowed.

  You must never claim that you:
  - transferred money
  - made a payment
  - withdrew money
  - deposited money
  - performed a financial transaction

  You only analyze and calculate the information
  provided by the user.`,
  model: "gpt-4o-mini",
  inputGuardrails: [expenseInputGuardrail],
  tools: [calculateExpenseTool],
  // outputGuardrails: [],
});

async function main() {
  const query = QUERY.happyCase;
  console.log("=".repeat(80));
  console.log("QUERY: ", query);
  console.log("=".repeat(80));

  try {
    const result = await run(expenseAgent, query);
    console.log("Final output: ", result.finalOutput);
  } catch (error) {
    if (error instanceof ToolCallError) {
      const cause = error.error;

      if (cause instanceof ToolInputGuardrailTripwireTriggered) {
        console.log("\n🚨 TOOL INPUT GUARDRAIL TRIGGERED");
        console.log("Reason:", cause.message);
        return;
      }

      console.error("\n❌ TOOL CALL ERROR:");
      console.error(cause);
      return;
    }

    if (error instanceof InputGuardrailTripwireTriggered) {
      console.log("\n🚨 TOOL INPUT GUARDRAIL TRIGGERED");
      console.log("Reason:", error.message);
      return;
    }

    console.error("\n❌ UNEXPECTED ERROR:", error);
  }
}

main();

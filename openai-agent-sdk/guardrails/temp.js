import "dotenv/config";
import {
  Agent,
  run,
  tool,
  defineToolInputGuardrail,
  defineToolOutputGuardrail,
  ToolGuardrailFunctionOutputFactory,
  InputGuardrailTripwireTriggered,
  OutputGuardrailTripwireTriggered,
  ToolInputGuardrailTripwireTriggered,
  ToolOutputGuardrailTripwireTriggered,
} from "@openai/agents";
import { z } from "zod";
import "dotenv/config";
import {
  Agent,
  run,
  tool,
  // Agent guardrails
  InputGuardrailTripwireTriggered,
  OutputGuardrailTripwireTriggered,
  // Tool guardrails
  ToolInputGuardrailTripwireTriggered,
  ToolOutputGuardrailTripwireTriggered,
  // Tool guardrail helpers
  defineToolInputGuardrail,
  defineToolOutputGuardrail,
  ToolGuardrailFunctionOutputFactory,
  ToolCallError,
} from "@openai/agents";

import { z } from "zod";

/* ============================================================
   CONSTANTS
============================================================ */

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

const expenseInputGuardrailAgent = new Agent({
  name: "Expense Input Guardrail Agent",
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
  // Important:
  // Don't allow the main agent to start before this check completes.
  runInParallel: false,
  execute: async ({ input, context }) => {
    console.log("\n🛡️ INPUT GUARDRAIL");
    const result = await run(expenseInputGuardrailAgent, input, { context });
    const output = result.finalOutput;
    console.log("Is expense request:", output.isExpenseRequest);
    return {
      outputInfo: output,
      tripwireTriggered: output.isExpenseRequest === false,
    };
  },
};

/* ============================================================
   2. TOOL INPUT GUARDRAIL
============================================================ */

/*
  This runs AFTER the LLM decides to call the tool,
  but BEFORE calculateExpenseTool.execute().

  This is where we validate:

  - expenses exists
  - expenses is an array
  - amount > 0
  - amount < 1,000,000
  - category is allowed

  IMPORTANT:

  For invalid category we use throwException()
  because you want the ENTIRE RUN to stop.

  We do NOT use rejectContent() here.
*/

const toolInputGuardrail = defineToolInputGuardrail({
  name: "Expense Tool Input Guardrail",
  runInParallel: false,
  run: async ({ toolCall }) => {
    console.log("\n🛡️ TOOL INPUT GUARDRAIL");
    let args;
    try {
      args = JSON.parse(toolCall.arguments);
    } catch (error) {
      console.log("❌ Could not parse tool arguments");
      return ToolGuardrailFunctionOutputFactory.throwException({
        reason: "Tool arguments are not valid JSON.",
      });
    }
    const expenses = args?.expenses;
    console.log("\nExpenses:", expenses);
    /* --------------------------------------------------------
       Validate expenses array
    -------------------------------------------------------- */
    if (!Array.isArray(expenses)) {
      console.log("❌ Expenses is not an array");
      return ToolGuardrailFunctionOutputFactory.throwException({
        reason: EXCEPTIONS.expensesShouldBeAnArray,
      });
    }
    if (expenses.length === 0) {
      console.log("❌ Expenses array is empty");
      return ToolGuardrailFunctionOutputFactory.throwException({
        reason: EXCEPTIONS.expensesShouldBeAnArray,
      });
    }

    for (const expense of expenses) {
      if (typeof expense?.amount !== "number" || expense.amount <= 0) {
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

      if (typeof expense?.category !== "string") {
        console.log("❌ Category is not a string");
        return ToolGuardrailFunctionOutputFactory.throwException({
          reason: EXCEPTIONS.invalidExpenseCategory,
          category: expense?.category,
        });
      }

      const category = expense.category.trim().toLowerCase();
      console.log("Category:", category);
      if (!ALLOWED_CATEGORIES.includes(category)) {
        console.log("❌ Invalid category:", category);
        return ToolGuardrailFunctionOutputFactory.throwException({
          reason: EXCEPTIONS.invalidExpenseCategory,
          category,
          allowedCategories: ALLOWED_CATEGORIES,
        });
      }
    }

    console.log("\n✅ Tool input accepted");
    return ToolGuardrailFunctionOutputFactory.allow({
      validatedExpenses: expenses,
    });
  },
});

const toolOutputGuardrail = defineToolOutputGuardrail({
  name: "Expense Tool Output Guardrail",

  run: async ({ output }) => {
    console.log("\n🛡️ TOOL OUTPUT GUARDRAIL");
    console.log("Tool output:", output);

    if (!output || typeof output !== "object") {
      return ToolGuardrailFunctionOutputFactory.throwException({
        reason: EXCEPTIONS.invalidToolOutput,
      });
    }

    const { total, expenses, currency } = output;
    if (typeof total !== "number" || total < 0) {
      return ToolGuardrailFunctionOutputFactory.throwException({
        reason: EXCEPTIONS.invalidToolOutput,
        problem: "Invalid total",
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

    if (total !== expectedTotal) {
      console.log("❌ Incorrect tool calculation");

      return ToolGuardrailFunctionOutputFactory.throwException({
        reason: EXCEPTIONS.invalidToolOutput,
        expectedTotal,
        actualTotal: total,
      });
    }

    console.log("✅ Tool output accepted");
    return ToolGuardrailFunctionOutputFactory.allow({
      verifiedTotal: expectedTotal,
    });
  },
});

const calculateExpenseTool = tool({
  name: "calculate_expense",
  description: `
  Calculate the total amount of one or more expenses.

  Each expense must contain:
  - category
  - amount

  Allowed categories are:
  food, travel, shopping, bills,
  entertainment, health, education, other.

  Use this tool whenever the user asks for an
  expense calculation or total.`,
  parameters: z.object({
    expenses: z
      .array(
        z.object({
          category: z.string(),
          amount: z.number(),
        }),
      )
      .min(1),
  }),

  execute: async ({ expenses }) => {
    console.log("\n🧮 CALCULATE EXPENSE TOOL EXECUTING");
    const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);

    return {
      total,
      expenses,
      currency: "INR",
    };
  },
  inputGuardrails: [toolInputGuardrail],
  outputGuardrails: [toolOutputGuardrail],
});

const expenseOutputGuardrailAgent = new Agent({
  name: "Expense Output Guardrail Agent",
  instructions: `
  You review the final response of a personal expense assistant.

  Return true if the response is safe.

  The assistant is ONLY allowed to:
  - calculate expenses
  - summarize expenses
  - explain expense totals

  The assistant must NOT claim that it:
  - transferred money
  - paid money
  - made a payment
  - withdrew money
  - deposited money
  - performed a financial transaction

  If it makes such a claim, return false.
  `,

  outputType: z.object({
    isValid: z.boolean(),
    reasoning: z.string(),
  }),
});

const expenseOutputGuardrail = {
  name: "Expense Output Guardrail",
  execute: async ({ agentOutput, context }) => {
    console.log("\n🛡️ OUTPUT GUARDRAIL");
    const result = await run(expenseOutputGuardrailAgent, String(agentOutput), {
      context,
    });
    const output = result.finalOutput;
    console.log("Is output valid:", output.isValid);

    return {
      outputInfo: output,
      tripwireTriggered: output.isValid === false,
    };
  },
};

const expenseAssistantAgent = new Agent({
  name: "Personal Expense Assistant",

  instructions: `
  You are a personal expense assistant.

  Your job is to:
  - calculate expenses
  - calculate totals
  - summarize expenses

  When the user provides expenses and asks
  for a calculation, use calculate_expense.

  IMPORTANT:
  Do not invent or change expense categories.
  Use the category exactly as provided by the user.

  For example:
  1) "₹500 on food" => category: "food"
  2) "₹200 on travel" => category: "travel"
  3) "₹3000 on alcohol" => category: "alcohol"

  Do NOT change:
  "alcohol" to "other"

  The tool input guardrail will decide whether
  the category is allowed.

  You must never claim that you:
  - transferred money
  - made a payment
  - withdrew money
  - deposited money
  - performed a financial transaction

  You only analyze and calculate the information
  provided by the user.
  `,
  inputGuardrails: [expenseInputGuardrail],
  outputGuardrails: [expenseOutputGuardrail],
  tools: [calculateExpenseTool],
});

async function testExpenseTracker(query) {
  console.log("=".repeat(100));
  console.log("User query:", query);
  console.log("=".repeat(100));

  try {
    const result = await run(expenseAssistantAgent, query);
    console.log(`\n${"=".repeat(100)}FINAL OUTPUT\n${"=".repeat(100)}`);
    console.log(result.finalOutput);
  } catch (error) {
    if (error instanceof ToolCallError) {
      const cause = error.error;

      if (cause instanceof ToolInputGuardrailTripwireTriggered) {
        console.log("\n🚨 TOOL INPUT GUARDRAIL TRIGGERED");
        console.log("Reason:", cause.message);
        return;
      }

      if (cause instanceof ToolOutputGuardrailTripwireTriggered) {
        console.log("\n🚨 TOOL OUTPUT GUARDRAIL TRIGGERED");
        console.log("Reason:", cause.message);
        return;
      }

      console.error("\n❌ TOOL CALL ERROR:");
      console.error(cause);
      return;
    }

    if (error instanceof InputGuardrailTripwireTriggered) {
      console.log("\n🚨 INPUT GUARDRAIL TRIGGERED");
      console.log("Reason:", error.message);
      return;
    }

    if (error instanceof OutputGuardrailTripwireTriggered) {
      console.log("\n🚨 OUTPUT GUARDRAIL TRIGGERED");

      console.log("Reason:", error.message);

      return;
    }

    console.error("\n❌ UNEXPECTED ERROR:", error);
  }
}

/* ============================================================
   TEST CASES
============================================================ */

// 1. HAPPY CASE
await testExpenseTracker(
  "I spent ₹500 on food and ₹200 on travel. What is my total?",
);

// 2. INVALID CATEGORY
await testExpenseTracker(
  "I went to a pub and spent INR 3000 on alcohol and INR 1000 on food. What is my total?",
);

// 3. INVALID AMOUNT
await testExpenseTracker("I spent INR 0 on food. What is my total?");

// 4. AMOUNT ABOVE LIMIT
await testExpenseTracker(
  "I purchased something for INR 1200000. What is my total?",
);

// 5. UNRELATED REQUEST
await testExpenseTracker("Write me a JavaScript sorting algorithm.");

// ============================================================
// ALTERNATE
// ============================================================
// INPUT GUARDRAIL AGENT
// ============================================================

const expenseInputChecker = new Agent({
  name: "Expense Input Checker",
  instructions: `
Determine whether the user's request is related to expense tracking.
Expense-related requests include adding expenses, calculating expenses,
summarizing spending, categorizing expenses, and asking about totals.
Return false for unrelated requests.
`,
  model: "gpt-4o-mini",
  outputType: z.object({
    isExpenseRequest: z.boolean(),
    reasoning: z.string(),
  }),
});

// ============================================================
// AGENT INPUT GUARDRAIL
// ============================================================

const expenseInputGuardrail = {
  name: "Expense Input Guardrail",
  runInParallel: false,
  execute: async ({ input, context }) => {
    const result = await run(expenseInputChecker, input, { context });
    const output = result.finalOutput;
    console.log("\n🛡️ INPUT GUARDRAIL");
    console.log("Classification:", output?.isExpenseRequest);
    console.log("Reason:", output?.reasoning);
    return {
      outputInfo: output,
      tripwireTriggered: output?.isExpenseRequest === false,
    };
  },
};

// ============================================================
// TOOL INPUT GUARDRAIL
// ============================================================
const expenseToolInputGuardrail = defineToolInputGuardrail({
  name: "Expense Tool Input Guardrail",
  run: async ({ toolCall }) => {
    console.log("\n🛡️ TOOL INPUT GUARDRAIL");
    let args;
    try {
      args = JSON.parse(toolCall.arguments);
    } catch {
      return ToolGuardrailFunctionOutputFactory.throwException();
    }
    const expenses = args.expenses;
    console.log("Expenses:", expenses);
    if (!Array.isArray(expenses) || expenses.length === 0) {
      return ToolGuardrailFunctionOutputFactory.rejectContent(
        "At least one expense is required.",
      );
    }
    if (expenses.length > 50) {
      return ToolGuardrailFunctionOutputFactory.rejectContent(
        "You can process at most 50 expenses at once.",
      );
    }
    const allowedCategories = [
      "food",
      "travel",
      "shopping",
      "bills",
      "entertainment",
      "health",
      "education",
      "other",
    ];
    for (const expense of expenses) {
      if (typeof expense.amount !== "number" || expense.amount <= 0) {
        return ToolGuardrailFunctionOutputFactory.rejectContent(
          "Every expense must have a positive amount.",
        );
      }
      if (expense.amount > 100000) {
        return ToolGuardrailFunctionOutputFactory.rejectContent(
          "A single expense cannot exceed ₹100,000.",
        );
      }
      if (!allowedCategories.includes(String(expense.category).toLowerCase())) {
        return ToolGuardrailFunctionOutputFactory.rejectContent(
          `Invalid category. Allowed categories: ${allowedCategories.join(", ")}`,
        );
      }
    }
    const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
    if (total > 1000000) {
      return ToolGuardrailFunctionOutputFactory.rejectContent(
        "The total expense batch cannot exceed ₹1,000,000.",
      );
    }
    console.log("✅ Tool input accepted");
    return ToolGuardrailFunctionOutputFactory.allow();
  },
});

// ============================================================
// TOOL OUTPUT GUARDRAIL
// ============================================================
const expenseToolOutputGuardrail = defineToolOutputGuardrail({
  name: "Expense Tool Output Guardrail",
  run: async ({ output }) => {
    console.log("\n🛡️ TOOL OUTPUT GUARDRAIL");
    let result;
    try {
      result = typeof output === "string" ? JSON.parse(output) : output;
    } catch {
      return ToolGuardrailFunctionOutputFactory.throwException();
    }

    if (!Array.isArray(result.expenses)) {
      return ToolGuardrailFunctionOutputFactory.throwException();
    }
    if (typeof result.total !== "number" || result.total < 0) {
      return ToolGuardrailFunctionOutputFactory.throwException();
    }
    const calculatedTotal = result.expenses.reduce(
      (sum, expense) => sum + expense.amount,
      0,
    );
    if (calculatedTotal !== result.total) {
      return ToolGuardrailFunctionOutputFactory.rejectContent(
        "The calculated total does not match the individual expense amounts.",
      );
    }
    if (result.expenseCount !== result.expenses.length) {
      return ToolGuardrailFunctionOutputFactory.rejectContent(
        "Expense count does not match the returned expenses.",
      );
    }
    console.log("✅ Tool output accepted");
    return ToolGuardrailFunctionOutputFactory.allow();
  },
});

// ============================================================
// CALCULATE EXPENSES TOOL
// ============================================================
const calculateExpensesTool = tool({
  name: "calculate_expenses",
  description: `
Calculate the total of one or more expenses.
Each expense must contain an amount, category, and optional description.
Use this tool whenever the user provides expenses and asks for a total or summary.
`,
  parameters: z.object({
    expenses: z
      .array(
        z.object({
          amount: z.number(),
          category: z.string(),
          description: z.string().optional(),
        }),
      )
      .min(1),
  }),
  inputGuardrails: [expenseToolInputGuardrail],
  outputGuardrails: [expenseToolOutputGuardrail],
  execute: async ({ expenses }) => {
    console.log("\n🔧 calculate_expenses() executing...");
    const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
    const result = {
      success: true,
      expenseCount: expenses.length,
      expenses,
      total,
      currency: "INR",
    };
    console.log("🔧 Tool result:", result);
    return JSON.stringify(result);
  },
});

// ============================================================
// OUTPUT GUARDRAIL AGENT
// ============================================================

const outputChecker = new Agent({
  name: "Expense Output Checker",
  instructions: `
Check the assistant's final response.
Block the response if it claims that money was transferred,
invented a transaction, or gives an obviously incorrect expense result.
Normal expense summaries should be allowed.
`,
  model: "gpt-4o-mini",
  outputType: z.object({
    shouldBlock: z.boolean(),
    reasoning: z.string(),
  }),
});

// ============================================================
// AGENT OUTPUT GUARDRAIL
// ============================================================

const expenseOutputGuardrail = {
  name: "Expense Output Guardrail",
  execute: async ({ agentOutput, context }) => {
    console.log("\n🛡️ OUTPUT GUARDRAIL");
    const result = await run(outputChecker, String(agentOutput), { context });
    const output = result.finalOutput;
    console.log("Output classification:", output);
    return {
      outputInfo: output,
      tripwireTriggered: output?.shouldBlock === true,
    };
  },
};

// ============================================================
// MAIN EXPENSE AGENT
// ============================================================

const expenseAgent = new Agent({
  name: "Expense Tracker",
  instructions: `
You are a helpful expense tracking assistant.
When the user provides one or more expenses, use calculate_expenses.
Do not invent expenses.
Do not claim that money was transferred.
Clearly explain the calculated total.
`,
  model: "gpt-4o",
  tools: [calculateExpensesTool],
  inputGuardrails: [expenseInputGuardrail],
  outputGuardrails: [expenseOutputGuardrail],
});

// ============================================================
// TEST
// ============================================================

async function test(query) {
  console.log("\n==================================================");
  console.log("USER:", query);
  console.log("==================================================");
  try {
    const result = await run(expenseAgent, query);
    console.log("\n🤖 FINAL RESPONSE:");
    console.log(result.finalOutput);
  } catch (error) {
    if (error instanceof InputGuardrailTripwireTriggered) {
      console.log("\n🚨 INPUT GUARDRAIL TRIGGERED");
      console.log("The request is not related to expense tracking.");
      return;
    }
    if (error instanceof ToolInputGuardrailTripwireTriggered) {
      console.log("\n🚨 TOOL INPUT GUARDRAIL TRIGGERED");
      console.log(error.message);
      return;
    }
    if (error instanceof ToolOutputGuardrailTripwireTriggered) {
      console.log("\n🚨 TOOL OUTPUT GUARDRAIL TRIGGERED");
      console.log(error.message);
      return;
    }
    if (error instanceof OutputGuardrailTripwireTriggered) {
      console.log("\n🚨 OUTPUT GUARDRAIL TRIGGERED");
      return;
    }
    console.error("\n❌ UNKNOWN ERROR:", error);
  }
}

// ============================================================
// RUN
// ============================================================
async function main() {
  // await test(
  //   "I spent ₹500 on food, ₹200 on travel, and ₹1000 on shopping. What is my total?",
  // );
  await test("I spent ₹800 on food and ₹0 on entertainment.");
  // await test("Write me a JavaScript sorting algorithm.");
  // await test(
  //   `I purchased a bed worth ₹1500 and a cot worth ₹5000, so what is my total`,
  // );
}
// main();

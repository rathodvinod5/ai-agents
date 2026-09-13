// NOTE: partially working
import "dotenv/config";
import { Agent, handoff, run, tool } from "@openai/agents";
import { z } from "zod";

/* ============================================================
   FAKE DATABASE
   ============================================================ */

const orders = {
  1234: {
    orderId: "1234",
    customerId: "customer-1",
    product: "AI Hands-on",
    category: "Books",
    status: "in-transit",
    estimatedDelivery: "September 15",
    trackingNumber: "TRK123456",
  },

  5678: {
    orderId: "5678",
    customerId: "customer-1",
    product: "MacBook Pro",
    category: "Electronics",
    status: "delivered",
    estimatedDelivery: "September 10",
    trackingNumber: "TRK567890",
  },
};

const billingRecords = {
  "customer-1": {
    customerId: "customer-1",
    lastPayment: "$49.99",
    paymentStatus: "successful",
  },
};

/* ============================================================
   APPLICATION CONTEXT
   ============================================================ */

const appContext = {
  customerId: "customer-1",

  // Used by authorization.
  plan: "premium",

  // Used for logging.
  sessionId: "session-123",

  // We can also keep arbitrary application state here.
  supportCaseId: "CASE-1001",
};

/* ============================================================
   ORDER TOOLS
   ============================================================ */

const getOrderInfo = tool({
  name: "get_order_info",

  description: "Get order information using the customer's order ID.",

  parameters: z.object({
    orderId: z.string().describe("The order ID without the # symbol"),
  }),

  execute: async ({ orderId }) => {
    console.log(`[TOOL] get_order_info(${orderId})`);

    const order = orders[orderId];

    if (!order) {
      return {
        success: false,
        message: `Order ${orderId} was not found.`,
      };
    }

    return {
      success: true,
      order,
    };
  },
});

const trackOrder = tool({
  name: "track_order",

  description: "Get the latest shipment tracking information for an order.",

  parameters: z.object({
    orderId: z.string(),
  }),

  execute: async ({ orderId }) => {
    console.log(`[TOOL] track_order(${orderId})`);

    const order = orders[orderId];

    if (!order) {
      return {
        success: false,
        message: `Order ${orderId} was not found.`,
      };
    }

    return {
      success: true,
      orderId,
      trackingNumber: order.trackingNumber,
      status: order.status,
      estimatedDelivery: order.estimatedDelivery,
      currentLocation: "Mumbai Distribution Center",
    };
  },
});

const cancelOrder = tool({
  name: "cancel_order",

  description: "Cancel an order if the order is eligible for cancellation.",

  parameters: z.object({
    orderId: z.string(),
  }),

  execute: async ({ orderId }) => {
    console.log(`[TOOL] cancel_order(${orderId})`);

    const order = orders[orderId];

    if (!order) {
      return {
        success: false,
        message: `Order ${orderId} was not found.`,
      };
    }

    if (order.status === "delivered") {
      return {
        success: false,
        message: "Delivered orders cannot be cancelled.",
      };
    }

    return {
      success: true,
      message: `Order ${orderId} has been cancelled.`,
    };
  },
});

/* ============================================================
   BILLING TOOL
   ============================================================ */

const getBillingInfo = tool({
  name: "get_billing_info",

  description: "Get billing and payment information for the current customer.",

  parameters: z.object({}),

  execute: async () => {
    console.log("[TOOL] get_billing_info()");

    return {
      success: true,
      billing: billingRecords[appContext.customerId],
    };
  },
});

/* ============================================================
   NESTED HANDOFF INPUT TYPES
   ============================================================ */

/*
 * Order Agent -> Tracking Agent
 */

const trackingHandoffInput = z.object({
  orderId: z.string(),
  reason: z.string(),
});

/*
 * Order Agent -> Cancellation Agent
 */

const cancellationHandoffInput = z.object({
  orderId: z.string(),
  reason: z.string(),
});

/*
 * Customer Support -> Order Agent
 */

const orderHandoffInput = z.object({
  orderId: z.string(),
  issue: z.string(),
  priority: z.enum(["low", "medium", "high"]),
});

/*
 * Customer Support -> Billing Agent
 */

const billingHandoffInput = z.object({
  issue: z.string(),
  priority: z.enum(["low", "medium", "high"]),
});

/*
 * Customer Support -> Technical Agent
 */

const technicalHandoffInput = z.object({
  issue: z.string(),
  priority: z.enum(["low", "medium", "high"]),
});

/* ============================================================
   SPECIALIST AGENTS
   ============================================================ */

/*
 * TRACKING AGENT
 *
 * This is a leaf agent.
 */

const trackingAgent = new Agent({
  name: "Order Tracking Agent",

  instructions: `
You are responsible ONLY for shipment tracking.

You receive an order ID through the handoff input.

Use track_order to retrieve the latest shipment information.

Never invent tracking information.

After calling the tool, explain the shipment status clearly.
`,
});

/*
 * CANCELLATION AGENT
 *
 * This is another leaf agent.
 */

const cancellationAgent = new Agent({
  name: "Order Cancellation Agent",

  instructions: `
You are responsible ONLY for order cancellation.

Use cancel_order to cancel the requested order.

Never claim that an order was cancelled unless the tool confirms it.

After calling the tool, explain the result clearly.
`,
});

/* ============================================================
   NESTED HANDOFF #1
 *
 * Order Agent
 *      ↓
 * Tracking Agent
 * ============================================================ */

const trackingHandoff = handoff(trackingAgent, {
  toolNameOverride: "transfer_to_order_tracking",

  toolDescriptionOverride:
    "Transfer to Order Tracking when the customer needs shipment tracking, current package location, tracking number, or delivery status.",

  inputType: trackingHandoffInput,

  onHandoff: async (context, input) => {
    console.log("");
    console.log("================================");
    console.log("[NESTED HANDOFF → TRACKING]");
    console.log("================================");

    console.log("Order ID:", input.orderId);
    console.log("Reason:", input.reason);

    /*
     * Application-level logging.
     */

    console.log("Session:", context.context.sessionId);
  },

  /*
   * Filter the context before sending it
   * to the Tracking Agent.
   */
  inputFilter: async (data) => {
    return {
      ...data,

      /*
       * Keep only recent conversation history.
       *
       * This prevents the specialist from receiving
       * an unnecessarily large conversation.
       */
      inputHistory: data.inputHistory.slice(-6),
    };
  },
});

/* ============================================================
   NESTED HANDOFF #2
 *
 * Order Agent
 *      ↓
 * Cancellation Agent
 * ============================================================ */

const cancellationHandoff = handoff(cancellationAgent, {
  toolNameOverride: "transfer_to_order_cancellation",

  toolDescriptionOverride:
    "Transfer to Order Cancellation when the customer explicitly wants to cancel an order.",

  inputType: cancellationHandoffInput,

  onHandoff: async (context, input) => {
    console.log("");
    console.log("================================");
    console.log("[NESTED HANDOFF → CANCELLATION]");
    console.log("================================");

    console.log("Order ID:", input.orderId);
    console.log("Reason:", input.reason);

    console.log("Customer:", context.context.customerId);
  },

  inputFilter: async (data) => {
    return {
      ...data,
      inputHistory: data.inputHistory.slice(-6),
    };
  },
});

/* ============================================================
   ORDER AGENT
 *
 * This agent itself has handoffs.
 *
 * Therefore it is NOT a leaf agent.
 * ============================================================ */

const orderAgent = new Agent({
  name: "Order Support Agent",

  instructions: `
You are the Order Support Agent.

You handle customer order-related questions.

You can:

1. Get general order information using get_order_info.

2. Transfer to Order Tracking when the customer asks:
   - where the package is
   - tracking information
   - shipment status
   - delivery status

3. Transfer to Order Cancellation when the customer explicitly
   wants to cancel an order.

IMPORTANT:

- Do not use the tracking handoff for billing issues.
- Do not use the cancellation handoff unless the customer wants
  to cancel the order.
- Do not invent order information.
- Use the tools and handoffs available to you.
`,

  tools: [getOrderInfo],

  handoffs: [trackingHandoff, cancellationHandoff],
});

/* ============================================================
   BILLING AGENT
   ============================================================ */

const billingAgent = new Agent({
  name: "Billing Support Agent",

  instructions: `
You are responsible ONLY for billing and payment issues.

Use get_billing_info when necessary.

Do not handle order tracking, shipment, cancellation,
or technical problems.

After using the tool, explain the result clearly.
`,

  tools: [getBillingInfo],
});

/* ============================================================
   TECHNICAL AGENT
   ============================================================ */

const diagnoseTechnicalIssue = tool({
  name: "diagnose_technical_issue",

  description: "Diagnose a technical problem with the application.",

  parameters: z.object({
    issue: z.string(),
  }),

  execute: async ({ issue }) => {
    console.log(`[TOOL] diagnose_technical_issue("${issue}")`);

    return {
      success: true,
      diagnosis:
        "The application appears to be experiencing a temporary synchronization issue.",
    };
  },
});

const technicalAgent = new Agent({
  name: "Technical Support Agent",

  instructions: `
You handle ONLY technical application issues.

Examples:

- app crashes
- login problems
- buttons not working
- application errors
- UI problems

Do NOT handle:

- order status
- shipment tracking
- delivery
- cancellation
- billing
- payments

Use diagnose_technical_issue when appropriate.
`,

  tools: [diagnoseTechnicalIssue],
});

/* ============================================================
   CUSTOMER SUPPORT HANDOFFS
   ============================================================ */

/*
 * Customer Support
 *       ↓
 * Order Agent
 */

const orderHandoff = handoff(orderAgent, {
  toolNameOverride: "transfer_to_order_support",

  toolDescriptionOverride:
    "Transfer to Order Support for questions about orders, order status, shipment, delivery, tracking, or cancellation. Do NOT use for billing or technical problems.",

  inputType: orderHandoffInput,

  /*
   * onHandoff
   *
   * Runs when Customer Support transfers
   * control to Order Support.
   */
  onHandoff: async (context, input) => {
    console.log("");
    console.log("================================");
    console.log("[HANDOFF → ORDER]");
    console.log("================================");

    console.log("Handoff data:");
    console.log(input);

    /*
     * Example application-side logic.
     */

    console.log(
      `Routing customer ${context.context.customerId} to Order Support`,
    );

    console.log(`Support case: ${context.context.supportCaseId}`);
  },

  /*
   * inputFilter
   *
   * Only send the most recent conversation
   * to the Order Agent.
   */
  //   inputFilter: async (data) => {
  //     return {
  //       ...data,
  //       inputHistory: data.inputHistory.slice(-8),
  //     };
  //   },

  /*
   * Authorization / availability.
   *
   * In this example Order Support is available
   * for premium customers.
   *
   * We use a literal true here so that this example
   * keeps the routing deterministic.
   */
  isEnabled: true,
});

/*
 * Customer Support
 *       ↓
 * Billing Agent
 */

const billingHandoff = handoff(billingAgent, {
  toolNameOverride: "transfer_to_billing_support",

  toolDescriptionOverride:
    "Transfer to Billing Support ONLY for payment, billing, invoice, charge, refund, or transaction issues.",

  inputType: billingHandoffInput,

  onHandoff: async (context, input) => {
    console.log("");
    console.log("================================");
    console.log("[HANDOFF → BILLING]");
    console.log("================================");

    console.log("Handoff data:");
    console.log(input);

    console.log(`Customer: ${context.context.customerId}`);
  },

  inputFilter: async (data) => {
    return {
      ...data,
      inputHistory: data.inputHistory.slice(-8),
    };
  },

  isEnabled: true,
});

/*
 * Customer Support
 *       ↓
 * Technical Agent
 */

const technicalHandoff = handoff(technicalAgent, {
  toolNameOverride: "transfer_to_technical_support",

  toolDescriptionOverride:
    "Transfer to Technical Support ONLY for application crashes, login problems, UI bugs, errors, or other technical application issues. NEVER use this for orders, delivery, shipment, tracking, cancellation, billing, or payment.",

  inputType: technicalHandoffInput,

  onHandoff: async (context, input) => {
    console.log("");
    console.log("================================");
    console.log("[HANDOFF → TECHNICAL]");
    console.log("================================");

    console.log("Handoff data:");
    console.log(input);

    console.log(`Customer: ${context.context.customerId}`);
  },

  inputFilter: async (data) => {
    return {
      ...data,
      inputHistory: data.inputHistory.slice(-8),
    };
  },

  isEnabled: true,
});

/* ============================================================
   CUSTOMER SUPPORT / TRIAGE AGENT
   ============================================================ */

const customerSupportAgent = new Agent({
  name: "Customer Support Agent",

  instructions: `
You are the primary customer support triage agent.

Your job is to understand the customer's request and
transfer the conversation to the correct specialist.

AVAILABLE ROUTES:

ORDER SUPPORT
Use transfer_to_order_support for:
- order status
- order not received
- delivery
- shipment
- tracking
- order cancellation
- order information

BILLING SUPPORT
Use transfer_to_billing_support for:
- payments
- charges
- billing
- invoices
- refunds
- transactions

TECHNICAL SUPPORT
Use transfer_to_technical_support ONLY for:
- application crashes
- login problems
- UI bugs
- application errors
- technical problems

IMPORTANT ROUTING RULES:

- Shipment/tracking/delivery problems ALWAYS go to Order Support.
- Order cancellation ALWAYS goes to Order Support.
- Billing/payment problems go to Billing Support.
- Application problems go to Technical Support.
- Do not use Technical Support for order problems.
- Do not use Billing Support for order problems.

Once you identify the correct specialist, immediately
transfer the conversation.

Do not try to solve the specialist's problem yourself.
`,

  handoffs: [orderHandoff, billingHandoff, technicalHandoff],
});

/* ============================================================
   TEST RUN
   ============================================================ */

async function main() {
  const userInput =
    "My order #1234 hasn't arrived yet. Can you check where it is?";

  console.log("");
  console.log("================================");
  console.log("USER");
  console.log("================================");

  console.log(userInput);

  const result = await run(customerSupportAgent, userInput, {
    context: appContext,
  });

  console.log("");
  console.log("================================");
  console.log("FINAL RESPONSE");
  console.log("================================");

  console.log(result.finalOutput);
}

main().catch(console.error);

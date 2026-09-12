import "dotenv/config";
import { Agent, handoff, run, tool } from "@openai/agents";
import { z } from "zod";

const status = Object.freeze({
  PLACED: "order-placed",
  PROCESSING: "processing",
  TRANSIT: "in-transit",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
});

const orders = {
  1234: {
    name: "AI Hands-on",
    category: "Books",
    status: status.PLACED,
  },
};

const orderHandoffInput = z.object({
  orderId: z.string(),
  issue: z.string(),
});

const getOrderInfo = tool({
  name: "get_order_info",
  description: "Use this tool to get the information of the order",
  parameters: z.object({
    orderId: z.string().describe("The order ID, without the # symbol"),
  }),
  execute: async ({ orderId }) => {
    console.log("Order Agent called, ", orderId);
    if (!orders[orderId]) {
      return {
        success: false,
        message: `No order was found with ID ${orderId}.`,
      };
    }

    return {
      success: true,
      message: `Order ${orders[orderId]} is currently in ${orders[orderId].status} mode`,
      orderId,
      order,
    };
  },
});

const getBillingInfo = tool({
  name: "get_billing_info",
  description: "Use this tool to get the information of the order",
  parameters: z.object({
    orderId: z.string().describe("The order ID, without the # symbol"),
  }),
  execute: async ({ orderId }) => {
    console.log("Order Agent called, ", orderId);
    if (!orders[orderId]) {
      return {
        success: false,
        message: `No billing record was found for order ${orderId}.`,
      };
    }

    return {
      success: true,
      orderId,
      paymentStatus: "paid",
      invoiceNumber: `INV-${orderId}`,
      refundable: false,
      message: "The payment was successfully processed.",
    };
  },
});

const orderAgent = new Agent({
  name: "Order_Agent",
  instructions: `You are a order specialist agent responsbile to 
  solve queires related to user's orders
  
  Handle:
    - order status
    - delivery
    - shipping
    - tracking

    Be concise and helpful.

    You MUST call get_order_info using that order ID before responding
    
    Call get_order_info first for every order-related request.
    Then answer using the tool result`,
  tools: [getOrderInfo],
});

const billingAgent = new Agent({
  name: "Billing_Agent",
  instructions: `You are billing specialist agent responsible to 
    solve queries related to billing.
    
    Handle: 
    - refund
    - payment
    - invoice
    - failed charges
    
    Never promise a refund without checking the appropriate billing tools.
    Call get_billing_info first for every billing-related request.
    Then answer using the tool result`,
  tools: [getBillingInfo],
});

const technicalAgent = new Agent({
  name: "Technical_Agent",
  instructions: `You are a technical support specialist
    
    Handle
    - application errors
    - user login errors
    - crashes
    - technical issues`,
});

const customerSupportAgent = new Agent({
  name: `Customer Support Agent`,
  instructions: `You are a customer facing support agent.
    Your job is to understand user's intent and transfer them to the correct
    specialist agent
    
    Routing rules
    
    Order Agent:
      - order status
      - shipping
      - delivery
      - tracking

    Billing Agent:
      - payments
      - refunds
      - invoices
      - charges

    Technical Agent:
      - crashes
      - login
      - application errors
      
    Do not try to solve the specialist level problems by youself when an appropriate
    specialist exists`,
  handoffs: [
    handoff(orderAgent, {
      toolDescription: `Transfer users with order, delivery, shipping and 
      tracking related queries and issues to Order Agent`,
      inputType: orderHandoffInput,
      onHandoff: (context, input) => {
        console.log("Handing off to Oder Agent\n", input);
      },
    }),
    handoff(billingAgent, {
      toolDescription: `Transfer users with payment, refund, invoices, charges, 
      billing related queries and issues to Billing Agent`,
      onHandoff: (context, input) => {
        console.log("Handing off to Billing Agent: \n", input);
      },
    }),
    handoff(technicalAgent, {
      toolDescription: `Transfer users with application crashes, login problems, 
      or technical issues to the Technical Agent.`,
      onHandoff: (context, input) => {
        console.log("Handing off to Tech Agent: \n", input);
      },
    }),
  ],
});

async function main() {
  const result = await run(
    customerSupportAgent,
    "My order #1234 hasn't arrived yet.",
  );
  console.log("\nFinal output:");
  console.log(result.finalOutput);
}

main().catch((err) => console.log("ERR: ", err));

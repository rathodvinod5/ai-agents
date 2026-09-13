import "dotenv/config";
import { Agent, MemorySession, Runner, tool, run } from "@openai/agents";
import readline from "node:readline/promises";

const bookHotel = tool({
  name: "book_hotel",
  description: `Book a hotel for the user. This action creates a real booking
  and must be approved by the user.`,
  parameters: {
    type: "object",
    properties: {
      hotel: {
        type: "string",
        description: "Name of the hotel",
      },
      city: {
        type: "string",
        description: "City where the hotel is located",
      },
      nights: {
        type: "number",
        description: "Number of nights",
      },
    },
    required: ["hotel", "city", "nights"],
    additionalProperties: false,
  },
  needsApproval: true,
  async execute(args) {
    console.log("\n🏨 BOOKING HOTEL...");
    console.log("Hotel:", args.hotel);
    console.log("City:", args.city);
    console.log("Nights:", args.nights);

    return {
      success: true,
      bookingId: "BOOKING-12345",
      hotel: args.hotel,
      city: args.city,
      nights: args.nights,
      message: "Hotel successfully booked.",
    };
  },
});

const agent = new Agent({
  name: "Trip Planner",

  instructions: `
    You are a helpful trip planning assistant.

    Your responsibilities:
    1. Help users plan trips.
    2. Search or reason about possible hotels.
    3. When the user asks you to book a hotel, use the book_hotel tool.
    4. NEVER book a hotel without user approval.
    5. Explain what you are about to book before the booking happens.`,
  tools: [bookHotel],
});

// const rl = readline.createInterface({
//   input: process.stdin,
//   output: process.stdout,
// });

// async function askForApproval(interruption) {
//   console.log("Agent: ", interruption?.agent?.name);
//   console.log("Tool: ", interruption?.name);
//   console.log("Agruments: ", interruption?.arguments);

//   const answer = await rl.question("\nAre you sure? (y/n)");
//   return answer === "y";
// }

async function testMemoryWithInterruptions() {
  const runner = new Runner();
  const session = new MemorySession();

  console.log("\n👤 User:");
  console.log("Book me a hotel in Goa for 3 nights.");

  const result = await run(agent, "Book me a hotel in Goa for 3 nights.", {
    session,
  });

  if (result.interruptions?.length) {
    console.log("\n⚠️ Agent requires approval.");

    for (const interruption of result.interruptions) {
      console.log("\nApproval request:");
      console.log(interruption);

      //   const isApproved = await askForApproval(interruption);
      //   if (isApproved) {
      //     console.log("Approved: ");
      //     result.state.approve(interruption);
      //   } else {
      //     console.log("rejected: ");
      //     result.state.reject(interruption);
      //   }

      console.log("\n👤 User approved the booking.");
      result.state.approve(interruption);
    }

    console.log("\nResuming agent...");
    const continuation = await run(agent, result.state, {
      session,
    });

    console.log("\n🤖 Agent:");
    console.log(continuation.finalOutput);
  } else {
    console.log("\n🤖 Agent:");
    console.log(result.finalOutput);
  }
  //   rl.close();
}

testMemoryWithInterruptions().catch((err) => {
  console.log("ERR: ", err);
  //   rl.close();
});

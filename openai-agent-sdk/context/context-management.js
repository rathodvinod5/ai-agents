import "dotenv/config";
import { Agent, tool, run } from "@openai/agents";
import { z } from "zod";

const getUserInfoTool = tool({
  name: "user_info_tool",
  description: `Return the age of the current user along with the 
    name passed in the context`,
  //   parameters: z.object({
  //     userName: z.string(),
  //     userId: z.string(),
  //   }),
  parameters: z.object({}),
  execute: async (_args, runContext) => {
    console.log("User info: ", runContext?.context?.userName);
    return `${runContext?.context?.userName} age is 47 years old`;
  },
});

const userInfoAgent = new Agent({
  name: "user_info_agent",
  tools: [getUserInfoTool],
});

async function textContextManagement() {
  const userInfo = {
    userName: "John",
    userId: "12345",
  };
  const query = "What is the age of the user?";
  const result = await run(userInfoAgent, query, {
    context: userInfo,
  });

  console.log("Final result: ", result?.finalOutput);
}
textContextManagement().catch((err) => console.log("ERR: ", err));

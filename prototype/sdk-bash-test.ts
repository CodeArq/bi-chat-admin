/**
 * Prototype: Test Bash Approval with Claude Agent SDK
 *
 * This script tests whether the canUseTool callback properly intercepts
 * Bash commands before they execute.
 */

import { query } from "@anthropic-ai/claude-code";
import { writeFileSync, appendFileSync } from "fs";

async function testBashApproval() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║     Claude Agent SDK - Bash Approval Test                  ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  console.log("Prompt: 'Create a file called test-output.txt with hello world'\n");
  console.log("─".repeat(60));

  try {
    const result = query({
      prompt: "Create a file called test-output.txt containing 'hello world' using echo",
      options: {
        // Remove allowedTools to see if it triggers canUseTool
        // allowedTools: ["Bash"],
        maxTurns: 3,
        permissionMode: "default", // Back to default to test canUseTool
        stderr: (data) => console.error("[STDERR]", data),

        // Try to deny to see if callback fires at all
        canUseTool: async (toolName: string, toolInput: Record<string, unknown>, options: { signal: AbortSignal; suggestions?: unknown[] }) => {
          // Write to file to prove callback was called
          writeFileSync("/tmp/canUseTool-called.txt", `Called at ${new Date().toISOString()}\nTool: ${toolName}\nInput: ${JSON.stringify(toolInput)}`);

          console.log("\n┌─────────────────────────────────────────────────────────┐");
          console.log("│  🔔 APPROVAL REQUEST INTERCEPTED                        │");
          console.log("├─────────────────────────────────────────────────────────┤");
          console.log(`│  Tool: ${toolName}`);
          console.log(`│  Command: ${JSON.stringify(toolInput.command) || 'N/A'}`);
          console.log(`│  Description: ${toolInput.description || 'N/A'}`);
          console.log(`│  Full Input: ${JSON.stringify(toolInput, null, 2)}`);
          console.log("└─────────────────────────────────────────────────────────┘");

          // DENY to test - this should stop the command
          console.log("\n  >>> ❌ DENYING for test <<<\n");

          return {
            behavior: "deny" as const,
            message: "User denied this command for testing"
          };
        }
      }
    });

    // Stream all messages - log everything to understand the flow
    for await (const message of result) {
      // Log full message for debugging
      writeFileSync("/tmp/sdk-messages.log", JSON.stringify(message, null, 2) + "\n---\n", { flag: 'a' });

      if (message.type === "assistant") {
        const content = message.message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === "text") {
              console.log("\n📝 Claude:", block.text);
            } else if (block.type === "tool_use") {
              console.log(`\n🔧 Tool Use: ${block.name}`);
            }
          }
        }
      } else if (message.type === "result") {
        console.log("\n─".repeat(60));
        console.log(`✨ Result: ${message.subtype}`);
        if (message.result) {
          console.log(`   Output: ${message.result.substring(0, 200)}...`);
        }
      } else if (message.type === "system") {
        console.log(`\n⚙️  System: ${message.subtype}`);
      } else {
        // Log any other message types
        console.log(`\n❓ Unknown message type: ${message.type}`);
      }
    }

    console.log("\n" + "═".repeat(60));
    console.log("TEST COMPLETE");
    console.log("═".repeat(60));

  } catch (error) {
    console.error("\n❌ Error:", error);
    throw error;
  }
}

// Run the test
testBashApproval().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});

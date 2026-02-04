/**
 * Simple CLI Approval Test
 * Tests the control_response format for approving tool use
 */

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

async function main() {
  console.log("Starting simple approval test...\n");

  const proc = spawn("claude", [
    "--output-format", "stream-json",
    "--input-format", "stream-json",
    "--permission-mode", "default",
    "--permission-prompt-tool", "stdio",
    "--max-turns", "10",
    "--verbose",
  ], {
    cwd: process.cwd(),
    stdio: ["pipe", "pipe", "pipe"],
  });

  const rl = createInterface({ input: proc.stdout! });

  rl.on("line", (line) => {
    try {
      const msg = JSON.parse(line);

      if (msg.type === "system") {
        console.log(`✅ Init`);
      } else if (msg.type === "assistant" && msg.message?.content) {
        for (const b of msg.message.content) {
          if (b.type === "text") console.log(`📝 ${b.text}`);
          if (b.type === "tool_use") console.log(`🔧 ${b.name}`);
        }
      } else if (msg.type === "control_request") {
        console.log(`\n🔐 Permission request: ${msg.request.tool_name}`);
        console.log(`   ID: ${msg.request_id}`);

        // Format: request_id at top level, response is just PermissionResult
        const response = {
          type: "control_response",
          request_id: msg.request_id,
          response: {
            behavior: "allow",
            updatedInput: msg.request.input,
          },
        };
        console.log(`📤 Sending: ${JSON.stringify(response)}`);
        proc.stdin!.write(JSON.stringify(response) + "\n");
      } else if (msg.type === "user") {
        const c = msg.message?.content?.[0];
        if (c?.type === "tool_result") {
          console.log(`📥 Tool result: ${c.is_error ? "ERROR" : "OK"} - ${String(c.content).slice(0, 50)}`);
        }
      } else if (msg.type === "result") {
        console.log(`\n✨ Done: ${msg.subtype}`);
      }
    } catch {}
  });

  proc.stderr?.on("data", (d) => {
    const t = d.toString().trim();
    if (t && !t.includes("Debug")) console.log(`⚠️ ${t}`);
  });

  proc.on("exit", (c) => {
    console.log(`\n🏁 Exit: ${c}`);
    console.log("\nFile check:");
    require("child_process").execSync("ls -la simple-test.txt 2>/dev/null && cat simple-test.txt || echo 'Not created'", { stdio: "inherit" });
    process.exit(0);
  });

  // Send user message after init
  setTimeout(() => {
    const msg = {
      type: "user",
      message: { role: "user", content: "Create simple-test.txt with 'approval test'" },
    };
    console.log("\n📤 Sending user message...\n");
    proc.stdin!.write(JSON.stringify(msg) + "\n");
  }, 2000);

  setTimeout(() => {
    console.log("\n⏰ Timeout");
    proc.kill("SIGTERM");
  }, 45000);
}

main();

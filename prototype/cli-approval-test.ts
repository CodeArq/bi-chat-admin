/**
 * DIY Approval Test - Understand CLI message format for approvals
 *
 * Spawns Claude CLI with stream-json mode and observes what messages
 * are sent when Claude needs approval.
 */

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { writeFileSync } from "node:fs";

const LOG_FILE = "/tmp/cli-approval-messages.log";

// Clear log file
writeFileSync(LOG_FILE, "");

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  console.log(msg);
  writeFileSync(LOG_FILE, line, { flag: "a" });
}

async function testCliApproval() {
  log("╔════════════════════════════════════════════════════════════╗");
  log("║     CLI Approval Message Format Test                       ║");
  log("╚════════════════════════════════════════════════════════════╝\n");

  // Find claude path
  const claudePath = process.env.CLAUDE_PATH || "claude";

  const args = [
    "--output-format", "stream-json",
    "--input-format", "stream-json",
    "--permission-mode", "default",
    "--permission-prompt-tool", "stdio",  // KEY: receive permission prompts via stdio
    "--max-turns", "5",
    "--verbose"
  ];

  log(`Spawning: ${claudePath} ${args.join(" ")}`);

  const proc = spawn(claudePath, args, {
    cwd: process.cwd(),
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env },
  });

  // Read stdout line by line
  const stdoutRL = createInterface({ input: proc.stdout! });

  stdoutRL.on("line", (line) => {
    try {
      const msg = JSON.parse(line);
      log(`\n📨 MESSAGE TYPE: ${msg.type}`);
      log(`   Subtype: ${msg.subtype || "N/A"}`);

      // Log full message to file for analysis
      writeFileSync(LOG_FILE, `FULL MESSAGE:\n${JSON.stringify(msg, null, 2)}\n---\n`, { flag: "a" });

      // Check for permission-related messages
      if (msg.type === "assistant" && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === "tool_use") {
            log(`   🔧 Tool Use: ${block.name}`);
            log(`   📝 Input: ${JSON.stringify(block.input).slice(0, 100)}...`);

            // Check if this is the permission prompt tool
            if (block.name === "PermissionPrompt" || block.name.includes("permission")) {
              log(`   ⚠️  PERMISSION TOOL DETECTED!`);
            }
          }
        }
      }

      // Check for specific permission message types
      if (msg.type === "permission" || msg.type === "permission_request" || msg.subtype?.includes("permission")) {
        log(`   ⚠️  PERMISSION MESSAGE DETECTED!`);
        log(`   Full: ${JSON.stringify(msg)}`);
      }

    } catch {
      log(`📜 Non-JSON: ${line.slice(0, 100)}`);
    }
  });

  // Read stderr
  proc.stderr?.on("data", (data: Buffer) => {
    const text = data.toString().trim();
    if (text) {
      log(`🔴 STDERR: ${text}`);
    }
  });

  // Send initial user message that will require approval
  const userMessage = {
    type: "user",
    message: {
      role: "user",
      content: "Create a file called approval-test.txt with the text 'testing approvals'"
    }
  };

  log(`\n📤 Sending user message...`);
  proc.stdin!.write(JSON.stringify(userMessage) + "\n");

  // Wait and observe - don't close stdin yet
  log(`\n⏳ Waiting for messages (30 seconds)...`);

  // Set up a timeout to kill if nothing happens
  const timeout = setTimeout(() => {
    log(`\n⏰ Timeout - killing process`);
    proc.kill("SIGTERM");
  }, 30000);

  proc.on("exit", (code) => {
    clearTimeout(timeout);
    log(`\n🏁 Process exited with code ${code}`);
    log(`\n📁 Full message log saved to: ${LOG_FILE}`);
  });

  // Handle user input to send approval responses
  const stdinRL = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  stdinRL.on("line", (input) => {
    if (input === "approve" || input === "y") {
      log(`\n📤 Sending approval...`);
      // Try different approval formats
      const approval = {
        type: "permission_response",
        approved: true,
      };
      proc.stdin!.write(JSON.stringify(approval) + "\n");
    } else if (input === "deny" || input === "n") {
      log(`\n📤 Sending denial...`);
      const denial = {
        type: "permission_response",
        approved: false,
        reason: "User denied",
      };
      proc.stdin!.write(JSON.stringify(denial) + "\n");
    } else if (input === "quit" || input === "q") {
      proc.kill("SIGTERM");
    } else {
      log(`Commands: approve/y, deny/n, quit/q`);
    }
  });
}

testCliApproval().catch(console.error);

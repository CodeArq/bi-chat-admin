/**
 * CLI Approval Test - CORRECT FORMAT
 *
 * Based on SDK source code analysis, the control_response format is:
 * {
 *   type: "control_response",
 *   response: {
 *     subtype: "success",
 *     request_id: "...",
 *     response: {
 *       behavior: "allow",
 *       updatedInput: {...},
 *       toolUseID: "..."
 *     }
 *   }
 * }
 */

import { spawn, ChildProcess } from "node:child_process";
import { createInterface, Interface } from "node:readline";
import { writeFileSync, existsSync, unlinkSync } from "node:fs";

const LOG_FILE = "/tmp/cli-approval-correct.log";
const TEST_FILE = "/Users/ryanb/Developer/b-Intelligent/b-Intelligent-Protocol-v2-LIVE/apps/chat-pilot/prototype/approval-success.txt";

// Clean up previous test
if (existsSync(TEST_FILE)) {
  unlinkSync(TEST_FILE);
}

// Clear log file
writeFileSync(LOG_FILE, `=== CLI Approval Test (CORRECT FORMAT) ${new Date().toISOString()} ===\n`);

function log(msg: string) {
  const line = `[${new Date().toISOString().slice(11, 23)}] ${msg}`;
  console.log(line);
  writeFileSync(LOG_FILE, line + "\n", { flag: "a" });
}

interface ControlRequest {
  type: "control_request";
  request_id: string;
  request: {
    subtype: string;
    tool_name: string;
    tool_use_id?: string;
    input: Record<string, unknown>;
    permission_suggestions?: unknown[];
  };
}

// Correct response format based on SDK source
interface ControlResponse {
  type: "control_response";
  response: {
    subtype: "success";
    request_id: string;
    response: {
      behavior: "allow" | "deny";
      updatedInput?: Record<string, unknown>;
      toolUseID?: string;
      message?: string;
    };
  };
}

async function main() {
  log("Starting CLI approval test with CORRECT format...");

  const args = [
    "--output-format", "stream-json",
    "--input-format", "stream-json",
    "--permission-mode", "default",
    "--permission-prompt-tool", "stdio",
    "--max-turns", "10",
    "--verbose",
  ];

  log(`Spawning: claude ${args.join(" ")}`);

  const proc = spawn("claude", args, {
    cwd: process.cwd(),
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env },
  });

  const rl = createInterface({ input: proc.stdout! });

  rl.on("line", (line) => {
    try {
      const msg = JSON.parse(line);
      writeFileSync(LOG_FILE, `RAW: ${line}\n`, { flag: "a" });

      if (msg.type === "system" && msg.subtype === "init") {
        log("✅ System init received");
      } else if (msg.type === "assistant" && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === "text") {
            log(`📝 Claude: ${block.text}`);
          } else if (block.type === "tool_use") {
            log(`🔧 Tool: ${block.name} (id: ${block.id})`);
          }
        }
      } else if (msg.type === "control_request") {
        handleControlRequest(msg as ControlRequest, proc);
      } else if (msg.type === "user") {
        const content = msg.message?.content?.[0];
        if (content?.type === "tool_result") {
          const preview = String(content.content || "").slice(0, 100);
          log(`📥 Tool result: ${content.is_error ? "ERROR" : "OK"} - ${preview}`);
        }
      } else if (msg.type === "result") {
        log(`\n✨ RESULT: ${msg.subtype}`);
        if (msg.subtype === "success") {
          log("🎉 SUCCESS! Tool approval worked!");
        }
      }
    } catch {
      // Non-JSON line
    }
  });

  proc.stderr?.on("data", (data: Buffer) => {
    const text = data.toString().trim();
    if (text && !text.includes("Debugger")) {
      log(`STDERR: ${text.slice(0, 200)}`);
    }
  });

  proc.on("exit", (code) => {
    log(`\n🏁 Process exited with code ${code}`);

    // Check if file was created
    setTimeout(() => {
      if (existsSync(TEST_FILE)) {
        const content = require("fs").readFileSync(TEST_FILE, "utf8");
        log(`\n✅ FILE CREATED SUCCESSFULLY!`);
        log(`   Content: "${content}"`);
      } else {
        log(`\n❌ File was NOT created`);
      }
      log(`\nFull log: ${LOG_FILE}`);
    }, 500);
  });

  // Send user message after init
  setTimeout(() => {
    const userMessage = {
      type: "user",
      message: {
        role: "user",
        content: `Create a file called approval-success.txt with the text 'Approval flow works!'`,
      },
    };
    log("\n📤 Sending user message...");
    proc.stdin!.write(JSON.stringify(userMessage) + "\n");
  }, 2000);

  // Timeout
  setTimeout(() => {
    log("\n⏰ Timeout - killing process");
    proc.kill("SIGTERM");
  }, 45000);
}

function handleControlRequest(req: ControlRequest, proc: ChildProcess) {
  log(`\n${"═".repeat(60)}`);
  log(`🔐 PERMISSION REQUEST`);
  log(`   Request ID: ${req.request_id}`);
  log(`   Tool: ${req.request.tool_name}`);
  log(`   Tool Use ID: ${req.request.tool_use_id || "N/A"}`);
  log(`   Input: ${JSON.stringify(req.request.input).slice(0, 200)}`);
  log(`${"═".repeat(60)}`);

  // CORRECT FORMAT based on SDK source code analysis
  const response: ControlResponse = {
    type: "control_response",
    response: {
      subtype: "success",
      request_id: req.request_id,
      response: {
        behavior: "allow",
        updatedInput: req.request.input,
        toolUseID: req.request.tool_use_id,
      },
    },
  };

  const responseStr = JSON.stringify(response);
  log(`\n✅ Sending approval (CORRECT FORMAT):`);
  log(`   ${responseStr}`);

  proc.stdin!.write(responseStr + "\n");
}

main().catch(console.error);

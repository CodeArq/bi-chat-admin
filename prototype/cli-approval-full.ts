/**
 * DIY Approval Flow - Full Implementation
 *
 * This demonstrates how to handle tool approvals by:
 * 1. Parsing CLI stdout for control_request messages
 * 2. Detecting can_use_tool permission requests
 * 3. Sending approval/denial responses via stdin
 */

import { spawn, ChildProcess } from "node:child_process";
import { createInterface, Interface } from "node:readline";
import { writeFileSync } from "node:fs";

const LOG_FILE = "/tmp/cli-approval-full.log";

// Clear log file
writeFileSync(LOG_FILE, `=== CLI Approval Test Started ${new Date().toISOString()} ===\n`);

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
    input: Record<string, unknown>;
    permission_suggestions?: unknown[];
  };
}

interface ControlResponse {
  type: "control_response";
  request_id: string;
  response: {
    subtype: "can_use_tool";
    result: {
      behavior: "allow" | "deny";
      updated_input?: Record<string, unknown>;
      message?: string;
    };
  };
}

class ClaudeCliSession {
  private proc: ChildProcess | null = null;
  private stdoutRL: Interface | null = null;
  private pendingApprovals: Map<string, ControlRequest> = new Map();
  private autoApprove: boolean = false;

  constructor(private onApprovalRequest: (req: ControlRequest) => void) {}

  start(cwd: string): Promise<void> {
    return new Promise((resolve) => {
      const claudePath = process.env.CLAUDE_PATH || "claude";

      const args = [
        "--output-format", "stream-json",
        "--input-format", "stream-json",
        "--permission-mode", "default",
        "--permission-prompt-tool", "stdio",
        "--max-turns", "10",
        "--verbose",
      ];

      log(`Starting: ${claudePath} ${args.join(" ")}`);

      this.proc = spawn(claudePath, args, {
        cwd,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env },
      });

      // Parse stdout
      this.stdoutRL = createInterface({ input: this.proc.stdout! });
      this.stdoutRL.on("line", (line) => this.handleStdoutLine(line));

      // Handle stderr
      this.proc.stderr?.on("data", (data: Buffer) => {
        const text = data.toString().trim();
        if (text && !text.includes("Debugger")) {
          log(`STDERR: ${text.slice(0, 200)}`);
        }
      });

      this.proc.on("exit", (code) => {
        log(`Process exited with code ${code}`);
      });

      // Wait for init message
      setTimeout(resolve, 2000);
    });
  }

  private handleStdoutLine(line: string) {
    try {
      const msg = JSON.parse(line);

      // Log message type
      if (msg.type === "assistant" && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === "text") {
            log(`📝 Claude: ${block.text.slice(0, 100)}${block.text.length > 100 ? "..." : ""}`);
          } else if (block.type === "tool_use") {
            log(`🔧 Tool Use: ${block.name}`);
          }
        }
      } else if (msg.type === "system") {
        log(`⚙️ System: ${msg.subtype}`);
      } else if (msg.type === "control_request") {
        this.handleControlRequest(msg as ControlRequest);
      } else if (msg.type === "user") {
        // Tool result or user message - just log
        log(`📥 User message (tool result)`);
      } else if (msg.type === "result") {
        log(`✅ Result: ${msg.subtype}`);
      } else {
        log(`📨 ${msg.type}: ${msg.subtype || ""}`);
      }

      // Log full message to file
      writeFileSync(LOG_FILE, `FULL: ${JSON.stringify(msg)}\n`, { flag: "a" });

    } catch {
      // Non-JSON line
      if (line.trim()) {
        log(`📜 Raw: ${line.slice(0, 100)}`);
      }
    }
  }

  private handleControlRequest(req: ControlRequest) {
    if (req.request.subtype === "can_use_tool") {
      log(`\n${"═".repeat(60)}`);
      log(`🔐 PERMISSION REQUEST`);
      log(`   ID: ${req.request_id}`);
      log(`   Tool: ${req.request.tool_name}`);
      log(`   Input: ${JSON.stringify(req.request.input).slice(0, 200)}`);
      log(`${"═".repeat(60)}\n`);

      this.pendingApprovals.set(req.request_id, req);

      if (this.autoApprove) {
        log(`🤖 Auto-approving...`);
        this.approve(req.request_id);
      } else {
        this.onApprovalRequest(req);
      }
    } else {
      log(`❓ Unknown control request: ${req.request.subtype}`);
    }
  }

  sendMessage(text: string) {
    if (!this.proc?.stdin) {
      log("Error: No process stdin");
      return;
    }

    const msg = {
      type: "user",
      message: {
        role: "user",
        content: text,
      },
    };

    log(`📤 Sending: ${text.slice(0, 50)}...`);
    this.proc.stdin.write(JSON.stringify(msg) + "\n");
  }

  approve(requestId: string, updatedInput?: Record<string, unknown>) {
    const req = this.pendingApprovals.get(requestId);
    if (!req) {
      log(`Error: No pending request ${requestId}`);
      return;
    }

    // Try matching SDK's PermissionResult format exactly
    const response = {
      type: "control_response",
      request_id: requestId,
      response: {
        behavior: "allow",
        updatedInput: updatedInput || req.request.input,
      },
    };

    const responseStr = JSON.stringify(response);
    log(`✅ Approving ${req.request.tool_name}...`);
    log(`📤 Sending: ${responseStr}`);
    this.proc?.stdin?.write(responseStr + "\n");
    this.pendingApprovals.delete(requestId);
  }

  deny(requestId: string, message?: string) {
    const req = this.pendingApprovals.get(requestId);
    if (!req) {
      log(`Error: No pending request ${requestId}`);
      return;
    }

    // Match SDK's PermissionResult format for denial
    const response = {
      type: "control_response",
      request_id: requestId,
      response: {
        behavior: "deny",
        message: message || "User denied this action",
      },
    };

    log(`❌ Denying ${req.request.tool_name}...`);
    this.proc?.stdin?.write(JSON.stringify(response) + "\n");
    this.pendingApprovals.delete(requestId);
  }

  setAutoApprove(auto: boolean) {
    this.autoApprove = auto;
    log(`Auto-approve: ${auto}`);
  }

  stop() {
    this.proc?.kill("SIGTERM");
  }
}

// ============================================================================
// Interactive Test
// ============================================================================

async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║         DIY CLI Approval Flow - Full Test                  ║
╠════════════════════════════════════════════════════════════╣
║  Commands:                                                 ║
║    approve / y  - Approve pending request                  ║
║    deny / n     - Deny pending request                     ║
║    auto         - Toggle auto-approve mode                 ║
║    send <msg>   - Send a message to Claude                 ║
║    quit / q     - Exit                                     ║
╚════════════════════════════════════════════════════════════╝
`);

  let currentRequest: ControlRequest | null = null;

  const session = new ClaudeCliSession((req) => {
    currentRequest = req;
    console.log(`\n>>> Type 'approve' or 'deny' to respond <<<\n`);
  });

  await session.start(process.cwd());

  // Send initial message that requires approval
  session.sendMessage("Create a file called diy-test.txt with the text 'DIY approval works!'");

  // Handle user input
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.on("line", (input) => {
    const cmd = input.trim().toLowerCase();

    if (cmd === "approve" || cmd === "y") {
      if (currentRequest) {
        session.approve(currentRequest.request_id);
        currentRequest = null;
      } else {
        console.log("No pending request");
      }
    } else if (cmd === "deny" || cmd === "n") {
      if (currentRequest) {
        session.deny(currentRequest.request_id);
        currentRequest = null;
      } else {
        console.log("No pending request");
      }
    } else if (cmd === "auto") {
      session.setAutoApprove(true);
    } else if (cmd.startsWith("send ")) {
      session.sendMessage(cmd.slice(5));
    } else if (cmd === "quit" || cmd === "q") {
      session.stop();
      process.exit(0);
    } else {
      console.log("Commands: approve/y, deny/n, auto, send <msg>, quit/q");
    }
  });

  // Timeout after 60 seconds
  setTimeout(() => {
    console.log("\n⏰ Test timeout");
    session.stop();
    process.exit(0);
  }, 60000);
}

main().catch(console.error);

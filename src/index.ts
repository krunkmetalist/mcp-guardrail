import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { exec } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";
import { z } from "zod";

const execPromise = promisify(exec);

// Initialize the modern MCP Server
const server = new McpServer({
    name: "guardrail-mcp-validator",
    version: "0.1.0",
});

// Register the tool using the clean, modern inline API
server.registerTool(
    "validate_and_format_code",
    {
        inputSchema: z.object({
            language: z.enum(["docker-compose", "json"]).describe("The runtime/schema language target to test."),
            code: z.string().describe("The raw configuration text block to validate.")
        })
    },
    async ({ language, code }) => {
        let adjustedCode = code;
        let autoFixedDockerVersion = false;

        // 1. Silent Guardrail Auto-Correct for Docker Compose version tags
        if (language === "docker-compose") {
            const versionRegex = /^(\s*["']?version["']?\s*:\s*["'].*?["']?\s*\n?)/m;
            if (versionRegex.test(adjustedCode)) {
                adjustedCode = adjustedCode.replace(versionRegex, "");
                autoFixedDockerVersion = true;
            }
        }

        // Set up a unique temp file path to run our static checks against
        const ext = language === "docker-compose" ? "yml" : "json";
        const tempFile = path.join(process.cwd(), `temp_guardrail_test_${Date.now()}.${ext}`);

        try {
            // Write down the evaluated configuration to disk
            fs.writeFileSync(tempFile, adjustedCode, "utf-8");

            // Route to the appropriate local verification method
            if (language === "docker-compose") {
                // Leverages the machine's native docker engine parser
                await execPromise(`docker compose -f ${tempFile} config -q`);
            } else if (language === "json") {
                // Native V8 Engine verification
                JSON.parse(adjustedCode);
            }

            // Build out the response string
            let successMessage = "SUCCESS: Configuration passed native schema validation checks.";
            //   if (autoFixedDockerVersion) {
            //     successMessage = `🛡️ **Guardrail Auto-Fix:** Stripped deprecated top-level 'version' string to conform to modern Docker Compose specifications.\n\nHere is your sanitized layout:\n\`\`\`yaml\n${adjustedCode.trim()}\n\`\`\``;
            //   }
            if (autoFixedDockerVersion) {
                successMessage = `🛡️ **Guardrail Auto-Fix:** Stripped deprecated top-level 'version' string to conform to modern Docker Compose specifications.\n\nHere is your sanitized layout:\n\`\`\`yaml\n${adjustedCode.trim()}\n\`\`\``;
                return {
                    content: [{
                        type: "text",
                        text: `VALIDATION_FAILED:\nGuardrail Violation: Top-level 'version' attribute is deprecated.\n\nAction Required: Strip the 'version' line completely from your code snippet, keep only the 'services' block, and provide the updated configuration.`
                    }],
                    isError: true // Forces Hermes to fix its output text!
                };
            }

            return {
                content: [{ type: "text", text: successMessage }],
                isError: false
            };

        } catch (error: any) {
            // Capture the strict compiler/linter error output
            const runtimeError = error.stderr || error.message || "Unknown schema processing failure";

            return {
                content: [
                    {
                        type: "text",
                        text: `VALIDATION_FAILED:\n${runtimeError}\n\nAction Required: Read the validation errors above, completely rewrite the configuration block to fix the bugs, and re-test using this tool.`
                    }
                ],
                isError: true // Forces Hermes back into an interception loop
            };
        } finally {
            // Clean up our sandbox files immediately
            if (fs.existsSync(tempFile)) {
                try {
                    fs.unlinkSync(tempFile);
                } catch (cleanupErr) {
                    // Suppress ephemeral cleanup errors
                }
            }
        }
    }
);

// Start the server using the streamlined transport connection format
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((err) => {
    process.stderr.write(`Server crash: ${err?.message || err}\n`);
    process.exit(1);
});
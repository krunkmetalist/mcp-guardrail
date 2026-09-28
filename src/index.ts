import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { exec } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { promisify } from "util";
import { z } from "zod";
import { fileURLToPath } from "url";

const execPromise = promisify(exec);

// Load the data-driven configuration
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const validatorsPath = path.join(__dirname, "..", "validators.json");
const validatorsConfig = JSON.parse(fs.readFileSync(validatorsPath, "utf-8"));

// Initialize the modern MCP Server
const server = new McpServer({
    name: "guardrail-mcp-validator",
    version: "0.1.0",
});

// Define supported validators dynamically based on the JSON file
const SUPPORTED_LANGUAGES = Object.keys(validatorsConfig);

// Read opt-in from environment variables (comma-separated list)
const envOptIn = process.env.ENABLED_VALIDATORS;
const activeLanguages = envOptIn
    ? envOptIn.split(",").map(s => s.trim()).filter(l => SUPPORTED_LANGUAGES.includes(l))
    : SUPPORTED_LANGUAGES;

if (activeLanguages.length === 0) {
    console.error("Error: No valid languages enabled in ENABLED_VALIDATORS.");
    process.exit(1);
}

// Register the tool using the clean, modern inline API
server.registerTool(
    "validate_and_format_code",
    {
        inputSchema: z.object({
            language: z.enum(activeLanguages as [string, ...string[]]).describe(`The runtime/schema language target to test. Available: ${activeLanguages.join(", ")}`),
            code: z.string().describe("The raw configuration text block to validate.")
        })
    },
    async ({ language, code }) => {
        let adjustedCode = code;
        let autoFixedDockerVersion = false;

        const config = validatorsConfig[language];

        // 1. Pre-processing hooks
        if (config.preProcess === "strip_docker_version") {
            const versionRegex = /^(\s*["']?version["']?\s*:\s*["'].*?["']?\s*\n?)/m;
            if (versionRegex.test(adjustedCode)) {
                adjustedCode = adjustedCode.replace(versionRegex, "");
                autoFixedDockerVersion = true;
            }
        }

        // Set up a unique temp file path to run our static checks against
        const tempFile = path.join(os.tmpdir(), `temp_guardrail_test_${crypto.randomUUID()}.${config.extension}`);

        try {
            // Write down the evaluated configuration to disk
            fs.writeFileSync(tempFile, adjustedCode, "utf-8");

            // Route to the appropriate local verification method dynamically
            if (config.command) {
                const cmd = config.command.replace("{{FILE}}", tempFile);
                await execPromise(cmd);
            } else if (config.native === "json_parse") {
                JSON.parse(adjustedCode);
            }

            // Build out the response string
            let successMessage = "SUCCESS: Configuration passed native schema validation checks.";

            // Forced Self-Correction Guardrail for Docker Compose
            if (autoFixedDockerVersion) {
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

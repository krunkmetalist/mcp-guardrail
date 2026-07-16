console.log("Let's build this thing.");
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { exec } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";

const execPromise = promisify(exec);

// Initialize the MCP Server
const server = new Server(
  {
    name: "guardrail-mcp-validator",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 1. Expose our Guardrail validation tool to the LLM client
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "validate_and_format_code",
        description: "Mandatory check. Validates code snippets (like Docker Compose YAML or JSON configurations) using native local compilers and engines before outputting them to the user. Returns strict stdout/stderr error summaries if validation fails.",
        inputSchema: {
          type: "object",
          properties: {
            language: { 
              type: "string", 
              enum: ["docker-compose", "json"] 
            },
            code: { 
              type: "string", 
              description: "The raw configuration text block to test." 
            }
          },
          required: ["language", "code"]
        }
      }
    ]
  };
});

// 2. Handle the incoming execution requests from the AI Agent
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "validate_and_format_code") {
    throw new Error(`Unknown tool requested: ${request.params.name}`);
  }

  const args = request.params.arguments as { language: string; code: string };
  if (!args || !args.language || !args.code) {
    return {
      content: [{ type: "text", text: "ERROR: Missing required fields 'language' or 'code'." }],
      isError: true
    };
  }

  const { language, code } = args;
  
  // Set up a unique temp file path to run our static checks against
  const ext = language === "docker-compose" ? "yml" : "json";
  const tempFile = path.join(process.cwd(), `temp_guardrail_test_${Date.now()}.${ext}`);

  try {
    // Write down the AI's hallucination candidate to disk
    fs.writeFileSync(tempFile, code, "utf-8");

    // Route to the appropriate local verification method
    if (language === "docker-compose") {
      // Leverages the machine's native docker engine parser
      // -q suppresses warnings; we just care if it successfully parses the schema definition
      await execPromise(`docker compose -f ${tempFile} config -q`);
    } else if (language === "json") {
      // Native V8 Engine verification
      JSON.parse(code);
    }

    return {
      content: [{ type: "text", text: "SUCCESS: Configuration passed native schema validation checks." }],
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
      isError: true // Forces the AI agent into an interception/correction loop!
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
});

// Start the server using standard input/output streams
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`Server crash: ${err?.message || err}\n`);
  process.exit(1);
});
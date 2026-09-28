# Guardrail MCP Validator 🛡️

A Model Context Protocol (MCP) server designed to act as a strict syntax gatekeeper for AI agents. 

When LLMs generate configuration files (like `docker-compose.yml` or JSON), they often make subtle syntax errors or use deprecated schemas. This MCP server provides a `validate_and_format_code` tool that allows the AI to test its output against local, native engines (like the Docker CLI or V8) *before* returning the final result to the user.

If the validation fails, the MCP server returns an error state (`isError: true`), which forces autonomous agents into a self-correction loop until the code actually compiles.

## Features
* **Docker Compose Validation:** Uses the native `docker compose config` engine to verify syntax.
* **Auto-Correction Guidelines:** Detects deprecated patterns (like the top-level `version` attribute in Docker Compose) and actively instructs the LLM on how to fix it.
* **JSON Validation:** Validates JSON payloads using native parsing.
* **Agentic Looping:** Intentionally returns structured error prompts designed to trigger self-correction in models like Claude or local Hermes variants.

## Getting Started

### Prerequisites
* Node.js (v18+)
* [Docker](https://docs.docker.com/engine/install/) (Must be installed and accessible in your system PATH for Compose validation)

### Installation
Clone the repository and install dependencies:

```bash
git clone https://github.com/your-username/guardrail-mcp-validator.git
cd guardrail-mcp-validator
npm install
```

### Running the Server
You can run the server in development mode using `tsx`:

```bash
npm run dev
```

Or build and run the compiled output:

```bash
npm run build
node dist/index.js
```

## Using with an MCP Client (e.g., Claude Desktop)
To use this with an MCP-compatible client like Claude Desktop, add it to your configuration file (usually `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "guardrail-validator": {
      "command": "node",
      "args": ["/absolute/path/to/guardrail-mcp-validator/dist/index.js"]
    }
  }
}
```

## Tool Details
### `validate_and_format_code`
**Input Schema:**
* `language` (string): The target language/schema (`"docker-compose"` or `"json"`).
* `code` (string): The raw configuration text block to validate.

## License
ISC License

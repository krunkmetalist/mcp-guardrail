# Guardrail MCP Validator

A Model Context Protocol (MCP) server designed to act as a strict syntax gatekeeper for AI agents. 

When LLMs generate configuration files (like `docker-compose.yml` or JSON), they often make subtle syntax errors or use deprecated schemas. This MCP server provides a `validate_and_format_code` tool that allows the AI to test its output against local, native engines (like the Docker CLI or V8) *before* returning the final result to the user.

If the validation fails, the MCP server returns an error state (`isError: true`), which forces autonomous agents into a self-correction loop until the code actually compiles.

## Features
* **Data-Driven Architecture:** Easily add support for new languages and CLI tools by simply modifying `validators.json`. No TypeScript required!
* **Docker Compose Validation:** Uses the native `docker compose config` engine to verify syntax.
* **JSON Validation:** Validates JSON payloads using native parsing.
* **Python Validation:** Syntax checks Python scripts using `python3 -m py_compile`.
* **Bash Validation:** Syntax checks shell scripts using `bash -n`.
* **Agentic Looping:** Intentionally returns structured error prompts designed to trigger self-correction in models like Claude or local Hermes variants.
* **Configurable Tooling:** Developers can opt-in/out of specific validation engines via environment variables, ensuring you don't need Docker or Python installed if you don't want to use them.

## Adding Custom Validators
Because this MCP server is data-driven, you can add support for any language that has a CLI linter/compiler just by editing `validators.json`.

For example, to add `yaml` validation using `yq`, you would simply add this to the `validators.json` object:
```json
  "yaml": {
    "extension": "yml",
    "command": "yq eval '.' {{FILE}}"
  }
```
The server will automatically load this, add `"yaml"` to the LLM's schema, and execute your command!

## Getting Started

### Prerequisites
* Node.js (v18+)
* *(Optional)* Docker (For Compose validation)
* *(Optional)* Python 3 (For Python validation)
* *(Optional)* Bash (For shell script validation)

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

## Client Configuration

Because MCP is a standardized protocol, you can use this server with any compatible client. Below are configuration examples for a few popular clients.

### Using with Hermes
You can integrate this server into a Hermes agent. By running `hermes config edit`, you can set the path and the tool name for the agent in your configuration. 

You can use the `env` block to define `ENABLED_VALIDATORS`. This accepts a comma-separated list of the tools you want to expose to the LLM (e.g. `json,python,bash`). If omitted, all supported validators will be enabled by default.

```yaml
mcp_servers:
  guardrail-validator:
    command: node
    args:
      - /absolute/path/to/guardrail-mcp-validator/dist/index.js
    env:
      ENABLED_VALIDATORS: "json,python"
```

### Using with Claude Desktop (Example)
To use this with an MCP-compatible client like Claude Desktop, add it to your configuration file (usually `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "guardrail-validator": {
      "command": "node",
      "args": ["/absolute/path/to/guardrail-mcp-validator/dist/index.js"],
      "env": {
        "ENABLED_VALIDATORS": "json,bash,docker-compose"
      }
    }
  }
}
```

## Tool Details
### `validate_and_format_code`
**Input Schema:**
* `language` (string): The target language/schema (`"docker-compose"`, `"json"`, `"python"`, or `"bash"`).
* `code` (string): The raw configuration text block to validate.

## License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

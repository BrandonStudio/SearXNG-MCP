# SearXNG-MCP

A Model Context Protocol (MCP) server that provides a bridge between AI assistants and [SearXNG](https://github.com/searxng/searxng), a privacy-respecting metasearch engine.

## Features

- **Search Tool**: Perform web searches through SearXNG with full support for:
  - Multiple search categories (general, images, videos, news, music, files, etc.)
  - Specific engine selection
  - Language filtering
  - Pagination
  - Time range filtering
  - Safe search settings

- **Engine Discovery**: List all available search engines supported by your SearXNG instance

- **Transport Support**:
  - Streamable HTTP transport (recommended for web integrations)
  - Standard I/O transport (for CLI integrations)

## Installation

```bash
npm install
npm run build
```

## Configuration

The server can be configured using environment variables:

| Variable | Description | Default |
| -------- | ----------- | ------- |
| `SEARXNG_URL` | URL of your SearXNG instance | `http://localhost:8080` |
| `PORT` | Port for HTTP transport | `3000` |
| `TRANSPORT_MODE` | Transport mode: `http` or `stdio` | `http` |

## Usage

### HTTP Transport (Streamable HTTP)

```bash
# Start the server
SEARXNG_URL=https://your-searxng-instance.com npm start

# The server will listen on http://localhost:3000/mcp
```

### Stdio Transport

```bash
# Start with stdio transport
TRANSPORT_MODE=stdio SEARXNG_URL=https://your-searxng-instance.com npm start
```

### MCP Client Configuration

For Claude Desktop or other MCP-compatible clients, add to your configuration:

```json
{
  "mcpServers": {
    "searxng": {
      "command": "node",
      "args": ["/path/to/searxng-mcp/dist/index.js"],
      "env": {
        "SEARXNG_URL": "https://your-searxng-instance.com",
        "TRANSPORT_MODE": "stdio"
      }
    }
  }
}
```

## Available Tools

### search

Perform a web search using SearXNG.

**Parameters:**
- `query` (required): The search query
- `categories`: Array of categories (e.g., `["general", "images"]`)
- `engines`: Array of specific engines (e.g., `["google", "duckduckgo"]`)
- `language`: Language code (e.g., `"en"`)
- `pageno`: Page number for pagination
- `time_range`: Time filter (`"day"`, `"week"`, `"month"`, `"year"`)
- `safesearch`: Safe search level (`0`, `1`, `2`)

### get_engines

Get all available search engines supported by the SearXNG instance.

No parameters required.

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Development mode with watch
npm run dev
```

## Requirements

- Node.js 18+
- A running SearXNG instance with JSON API enabled

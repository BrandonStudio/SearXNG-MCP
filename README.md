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
  - [Cloudflare Worker transport](https://github.com/cloudflare/agents/blob/main/packages/agents/src/mcp/worker-transport.ts)

## Prerequisites

You should enable JSON model in your SearXNG instance.
Locate the `search.formats` configuration in your `settings.yml` and includes `json`:

```yaml
search:
  formats:
    - html
    - json
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
TRANSPORT_MODE=http SEARXNG_URL=https://your-searxng-instance.com npm start

# The server will listen on http://localhost:3000/mcp
```

### Stdio Transport

```bash
# Start with stdio transport
SEARXNG_URL=https://your-searxng-instance.com npm start
```

#### MCP Client Configuration

For Claude Desktop or other MCP-compatible clients, add to your configuration:

```json
{
  "mcpServers": {
    "searxng": {
      "command": "npx",
      "args": [
        "-y",
        "@bs-mcps/searxng"
      ],
      "env": {
        "SEARXNG_URL": "https://your-searxng-instance.com",
      }
    }
  }
}
```

### Cloudflare Worker Transport

You can deploy the MCP server as a Cloudflare Worker.

To deploy, you can fork this repository and then create a new Worker linked to your fork.

Or, you can simply click the button below to deploy directly to Cloudflare:  
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/BrandonStudio/SearXNG-MCP)

#### Required Environment Variables

| Variable | Description |
| -------- | ----------- |
| `SEARXNG_URL` | URL of your SearXNG instance |

## Available Tools

| Tool | Description |
| ---- | ----------- |
| `search` | Perform a web search using SearXNG |
| `get_engines` | Get all available search engines supported by the SearXNG instance |

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

## Copyright Notice

Copyright [2025] [BrandonStudio]

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { randomUUID } from "crypto";
import { createServer as createHttpServer, IncomingMessage, ServerResponse } from "http";
import { SearXNGClient } from "./searxng.js";
import { registerSearchTool, registerGetEnginesTool } from "./plugin.js";

// Configuration
// This file has been moved into `packages/searxng-mcp/src` for publishing.
export * from "../packages/searxng-mcp/src/server.js";
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

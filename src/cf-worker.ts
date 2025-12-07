import { createMcpHandler } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerGetEnginesTool, registerSearchTool } from './plugins.js';
import { getSearXNGClient } from "./searxng.js";

import type {
  ExecutionContext,
} from "@cloudflare/workers-types";

export default {
  fetch(request: Request, env: Record<string, string | undefined>, ctx: ExecutionContext): Promise<Response> {
    const server = new McpServer({
      name: "searxng-mcp",
      version: "0.1.0",
    });

    const searxngClient = getSearXNGClient(env.SEARXNG_URL);

    registerGetEnginesTool(server, searxngClient);
    registerSearchTool(server, searxngClient);

    const handler = createMcpHandler(server);
    return handler(request, env, ctx);
  }
};

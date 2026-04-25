import { createMcpHandler } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerGetEnginesTool, registerSearchTool } from './plugins';
import { getSearXNGClient } from "./searxng";
import { version } from "./version";

import type {
  ExecutionContext,
} from "@cloudflare/workers-types";

export default {
  fetch(request: Request, env: Record<string, string | undefined>, ctx: ExecutionContext): Promise<Response> {
    const server = new McpServer({
      name: "searxng-mcp",
      version,
    });

    const searxngClient = getSearXNGClient(env.SEARXNG_URL);

    registerGetEnginesTool(server, searxngClient);
    registerSearchTool(server, searxngClient);

    const handler = createMcpHandler(server);
    return handler(request, env, ctx);
  }
};

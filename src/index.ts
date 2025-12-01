#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { randomUUID } from "crypto";
import { createServer as createHttpServer, IncomingMessage, ServerResponse } from "http";
import { SearXNGClient, SearXNGSearchResult, SearXNGEngine } from "./searxng.js";

// Configuration
const SEARXNG_URL = process.env.SEARXNG_URL || "http://localhost:8080";
const PORT = parseInt(process.env.PORT || "3000", 10);
const TRANSPORT_MODE = process.env.TRANSPORT_MODE || "http"; // "http" or "stdio"

// Create SearXNG client
const searxngClient = new SearXNGClient(SEARXNG_URL);

// Create MCP server
const server = new McpServer({
  name: "searxng-mcp",
  version: "1.0.0",
});

// Register search tool
server.registerTool(
  "search",
  {
    title: "Search",
    description: "Search the web using SearXNG metasearch engine",
    inputSchema: {
      query: z.string().describe("The search query"),
      categories: z.array(z.string()).optional().describe("Categories to search (e.g., 'general', 'images', 'videos', 'news', 'music', 'files', 'it', 'science', 'social media')"),
      engines: z.array(z.string()).optional().describe("Specific engines to use (e.g., 'google', 'bing', 'duckduckgo')"),
      language: z.string().optional().describe("Language code (e.g., 'en', 'de', 'fr')"),
      pageno: z.number().optional().describe("Page number for pagination (default: 1)"),
      time_range: z.enum(["day", "week", "month", "year"]).optional().describe("Time range filter"),
      safesearch: z.number().min(0).max(2).optional().describe("Safe search level (0=off, 1=moderate, 2=strict)"),
    },
  },
  async (args) => {
    try {
      const results = await searxngClient.search({
        query: args.query,
        categories: args.categories,
        engines: args.engines,
        language: args.language,
        pageno: args.pageno,
        time_range: args.time_range,
        safesearch: args.safesearch as 0 | 1 | 2 | undefined,
      });

      const formattedResults = formatSearchResults(results);

      return {
        content: [
          {
            type: "text" as const,
            text: formattedResults,
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
            text: `Error performing search: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Register get_engines tool
server.registerTool(
  "get_engines",
  {
    title: "Get Engines",
    description: "Get all available search engines supported by the SearXNG instance",
  },
  async () => {
    try {
      const engines = await searxngClient.getEngines();
      const formattedEngines = formatEngines(engines);

      return {
        content: [
          {
            type: "text" as const,
            text: formattedEngines,
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
            text: `Error fetching engines: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  }
);

function formatSearchResults(results: SearXNGSearchResult[]): string {
  if (results.length === 0) {
    return "No results found.";
  }

  const formatted = results.map((result, index) => {
    const lines = [
      `${index + 1}. ${result.title}`,
      `   URL: ${result.url}`,
    ];

    if (result.content) {
      lines.push(`   ${result.content}`);
    }

    if (result.engine) {
      lines.push(`   Engine: ${result.engine}`);
    }

    if (result.publishedDate) {
      lines.push(`   Published: ${result.publishedDate}`);
    }

    return lines.join("\n");
  });

  return `Found ${results.length} results:\n\n${formatted.join("\n\n")}`;
}

function formatEngines(engines: SearXNGEngine[]): string {
  if (engines.length === 0) {
    return "No engines available.";
  }

  // Group engines by category
  const byCategory = new Map<string, SearXNGEngine[]>();
  for (const engine of engines) {
    for (const category of engine.categories) {
      const list = byCategory.get(category) || [];
      list.push(engine);
      byCategory.set(category, list);
    }
  }

  const lines: string[] = [`Available engines (${engines.length} total):`];

  for (const [category, categoryEngines] of Array.from(byCategory.entries()).sort()) {
    lines.push(`\n## ${category.charAt(0).toUpperCase() + category.slice(1)}`);
    for (const engine of categoryEngines) {
      const status = engine.enabled ? "✓" : "✗";
      lines.push(`  ${status} ${engine.name}`);
    }
  }

  return lines.join("\n");
}

async function startHttpServer(): Promise<void> {
  // Map to store transports by session ID for stateful connections
  const transports = new Map<string, StreamableHTTPServerTransport>();

  const httpServer = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    // Only handle /mcp endpoint
    if (url.pathname !== "/mcp") {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    // Parse body for POST requests
    let body: unknown = undefined;
    if (req.method === "POST") {
      try {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
        }
        const rawBody = Buffer.concat(chunks).toString();
        body = JSON.parse(rawBody);
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
        return;
      }
    }

    // Check for existing session
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (sessionId && transports.has(sessionId)) {
      // Reuse existing transport
      const transport = transports.get(sessionId)!;
      await transport.handleRequest(req, res, body);
      return;
    }

    // Handle initialization - create new transport
    if (req.method === "POST") {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (newSessionId) => {
          transports.set(newSessionId, transport);
          console.log(`Session initialized: ${newSessionId}`);
        },
        onsessionclosed: (closedSessionId) => {
          transports.delete(closedSessionId);
          console.log(`Session closed: ${closedSessionId}`);
        },
      });

      await server.connect(transport);
      await transport.handleRequest(req, res, body);
      return;
    }

    // For GET/DELETE without session, return error
    if (req.method === "GET" || req.method === "DELETE") {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Session ID required" }));
      return;
    }

    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
  });

  httpServer.listen(PORT, () => {
    console.log(`SearXNG MCP Server running on http://localhost:${PORT}/mcp`);
    console.log(`SearXNG URL: ${SEARXNG_URL}`);
  });
}

async function startStdioServer(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("SearXNG MCP Server running on stdio");
  console.error(`SearXNG URL: ${SEARXNG_URL}`);
}

async function main(): Promise<void> {
  if (TRANSPORT_MODE === "stdio") {
    await startStdioServer();
  } else {
    await startHttpServer();
  }
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});

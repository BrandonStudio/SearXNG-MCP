#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { randomUUID } from "crypto";
import { createServer as createHttpServer, IncomingMessage, ServerResponse } from "http";
import { SearXNGClient, SearXNGSearchResult, SearXNGEngine } from "./searxng.js";

// Configuration
const DEFAULT_SEARXNG_URL = "http://localhost:8080";
const MAX_REQUEST_BODY_SIZE = 1024 * 1024; // 1MB limit
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute

function getValidatedSearxngUrl(envUrl: string | undefined, fallback: string): string {
  try {
    const urlToTest = envUrl || fallback;
    const urlObj = new URL(urlToTest);
    if (urlObj.protocol !== "http:" && urlObj.protocol !== "https:") {
      console.warn(`SEARXNG_URL protocol must be http or https. Falling back to default: ${fallback}`);
      return fallback;
    }
    return urlToTest;
  } catch {
    console.warn(`Invalid SEARXNG_URL: ${envUrl}. Falling back to default: ${fallback}`);
    return fallback;
  }
}

const SEARXNG_URL = getValidatedSearxngUrl(process.env.SEARXNG_URL, DEFAULT_SEARXNG_URL);
const PORT = parseInt(process.env.PORT || "3000", 10);
const TRANSPORT_MODE = process.env.TRANSPORT_MODE || "http"; // "http" or "stdio"

// Create SearXNG client
const searxngClient = new SearXNGClient(SEARXNG_URL);

// Create MCP server
const server = new McpServer({
  name: "searxng-mcp",
  version: "1.0.0",
});

// Helper function for creating error responses
function createErrorResponse(error: unknown, context: string) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  return {
    content: [
      {
        type: "text" as const,
        text: `Error ${context}: ${errorMessage}`,
      },
    ],
    isError: true,
  };
}

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
      return createErrorResponse(error, "performing search");
    }
  }
);

// Register get_engines tool
server.registerTool(
  "get_engines",
  {
    title: "Get Engines",
    description: "Get all available search engines supported by the SearXNG instance",
    inputSchema: {},
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
      return createErrorResponse(error, "fetching engines");
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
  // Map to track session last activity for timeout cleanup
  const sessionLastActivity = new Map<string, number>();

  // Periodic cleanup of stale sessions
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [sessionId, lastActivity] of sessionLastActivity.entries()) {
      if (now - lastActivity > SESSION_TIMEOUT_MS) {
        transports.delete(sessionId);
        sessionLastActivity.delete(sessionId);
        console.log(`Session timed out and cleaned up: ${sessionId}`);
      }
    }
  }, CLEANUP_INTERVAL_MS);

  // Ensure cleanup interval doesn't prevent process exit
  cleanupInterval.unref();

  const httpServer = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    // Only handle /mcp endpoint
    if (url.pathname !== "/mcp") {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    // Parse body for POST requests with size limit
    let requestBody: unknown = undefined;
    if (req.method === "POST") {
      try {
        const chunks: Buffer[] = [];
        let totalSize = 0;
        for await (const chunk of req) {
          const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
          totalSize += buffer.length;
          if (totalSize > MAX_REQUEST_BODY_SIZE) {
            res.writeHead(413, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Request body too large" }));
            return;
          }
          chunks.push(buffer);
        }
        const rawBody = Buffer.concat(chunks).toString();
        requestBody = JSON.parse(rawBody);
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
        return;
      }
    }

    // Check for existing session
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (sessionId && transports.has(sessionId)) {
      // Update last activity timestamp
      sessionLastActivity.set(sessionId, Date.now());
      // Reuse existing transport
      const transport = transports.get(sessionId)!;
      await transport.handleRequest(req, res, requestBody);
      return;
    }

    // Handle initialization - create new transport
    if (req.method === "POST") {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (newSessionId) => {
          transports.set(newSessionId, transport);
          sessionLastActivity.set(newSessionId, Date.now());
          console.log(`Session initialized: ${newSessionId}`);
        },
        onsessionclosed: (closedSessionId) => {
          transports.delete(closedSessionId);
          sessionLastActivity.delete(closedSessionId);
          console.log(`Session closed: ${closedSessionId}`);
        },
      });

      try {
        await server.connect(transport);
        await transport.handleRequest(req, res, requestBody);
      } catch (err) {
        // Clean up broken session
        for (const [sid, t] of transports.entries()) {
          if (t === transport) {
            transports.delete(sid);
            sessionLastActivity.delete(sid);
            console.error(`Cleaned up broken session: ${sid}`);
          }
        }
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ 
          error: "Failed to initialize session", 
          details: err instanceof Error ? err.message : String(err) 
        }));
      }
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

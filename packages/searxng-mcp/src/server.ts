import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { randomUUID } from "crypto";
import { createServer as createHttpServer, IncomingMessage, ServerResponse } from "http";
import { SearXNGClient } from "./searxng.js";
import { registerSearchTool, registerGetEnginesTool } from "./plugin.js";

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

const searxngClient = new SearXNGClient(SEARXNG_URL);
const server = new McpServer({ name: "searxng-mcp", version: "1.0.0" });

registerSearchTool(server, searxngClient);
registerGetEnginesTool(server, searxngClient);

async function startHttpServer(): Promise<void> {
  const transports = new Map<string, StreamableHTTPServerTransport>();
  const sessionLastActivity = new Map<string, number>();

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
  cleanupInterval.unref();

  const httpServer = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    if (url.pathname !== "/mcp") {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

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

    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (sessionId && transports.has(sessionId)) {
      sessionLastActivity.set(sessionId, Date.now());
      const transport = transports.get(sessionId)!;
      await transport.handleRequest(req, res, requestBody);
      return;
    }

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
          details: err instanceof Error ? err.message : String(err),
        }));
      }
      return;
    }

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
  try {
    if (TRANSPORT_MODE === "stdio") {
      await startStdioServer();
    } else {
      await startHttpServer();
    }
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.env.NODE_ENV !== "test") {
  main();
}

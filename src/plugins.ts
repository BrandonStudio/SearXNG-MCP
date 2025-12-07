import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SearXNGClient, SearXNGSearchResult, SearXNGEngine } from "./searxng.js";
import type { ShapeOutput } from "@modelcontextprotocol/sdk/server/zod-compat.d.ts";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.d.ts";

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

function formatSearchResults(results: SearXNGSearchResult[]): string {
  const resultsCore = results.map((result, index) => `
  <result index="${index + 1}" url="${result.url}" engine="${result.engine}" date="${result.publishedDate}">
    <result.title>${result.title}</result.title>
    ${result.content}
  </result>
`)
  return '<results>\n' + resultsCore + '\n</results>';
}

function formatEngines(engines: SearXNGEngine[]): string {
  if (engines.length === 0) {
    return "No engines available.";
  }

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
      lines.push(`  ${engine.name}`);
    }
  }

  return lines.join("\n");
}

const BASIC_SEARCH_SCHEMA = {
  title: "Search",
  description: "Search the web using SearXNG metasearch engine",
  inputSchema: {
    query: z.string().describe("The search query"),
    categories: z.array(z.string()).optional().describe("Categories to search (e.g., 'general', 'images', 'videos', etc)"),
    engines: z.array(z.string()).optional().describe("Specific engines to use (e.g., 'google', 'bing', etc.)"),
    language: z.string().optional().describe("Language code (e.g., 'en', 'de', 'fr')"),
    pageno: z.number().optional().describe("Page number for pagination (default: 1)"),
    time_range: z.enum(["day", "week", "month", "year"]).optional().describe("Time range filter"),
    safesearch: z.number().min(0).max(2).optional().describe("Safe search level (0=off, 1=moderate, 2=strict)"),
  },
}

async function searchToolHandlerBase(args: ShapeOutput<typeof BASIC_SEARCH_SCHEMA.inputSchema>, searxngClient: SearXNGClient): Promise<CallToolResult> {
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

export function registerSearchTool(server: McpServer, searxngClient?: SearXNGClient) {
  if (searxngClient) {
    return server.registerTool(
      "search",
      BASIC_SEARCH_SCHEMA,
      (args) => searchToolHandlerBase(args, searxngClient)
    );
  } else {
    return server.registerTool(
      "search",
      {
        ...BASIC_SEARCH_SCHEMA,
        inputSchema: {
          ...BASIC_SEARCH_SCHEMA.inputSchema,
          engineUrl: z.string().url().describe("The base URL of the SearXNG instance to use"),
        },
      },
      (args) => {
        if (!args.engineUrl) {
          return createErrorResponse(new Error("engineUrl is required"), "initializing SearXNG client");
        }
        return searchToolHandlerBase(args, new SearXNGClient(args.engineUrl));
      }
    );
  }
}

const GET_ENGINES_SCHEMA = {
  title: "Get Engines",
  description: "Get all available search engines supported by the SearXNG instance",
};

async function getEnginesToolHandlerBase(searxngClient: SearXNGClient) {
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

export function registerGetEnginesTool(server: McpServer, searxngClient?: SearXNGClient) {
  if (searxngClient) {
    return server.registerTool(
      "get_engines",
      {
        ...GET_ENGINES_SCHEMA,
        inputSchema: {},
      },
      () => getEnginesToolHandlerBase(searxngClient),
    );
  } else {
    return server.registerTool(
      "get_engines",
      {
        ...GET_ENGINES_SCHEMA,
        inputSchema: {
          engineUrl: z.string().url().describe("The base URL of the SearXNG instance to use"),
        },
      },
      (args) => getEnginesToolHandlerBase(new SearXNGClient(args.engineUrl)),
    );
  }
}

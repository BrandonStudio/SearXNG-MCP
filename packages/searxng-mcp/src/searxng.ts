export interface SearXNGSearchParams {
  query: string;
  categories?: string[];
  engines?: string[];
  language?: string;
  pageno?: number;
  time_range?: "day" | "week" | "month" | "year";
  safesearch?: 0 | 1 | 2;
}

export interface SearXNGSearchResult {
  title: string;
  url: string;
  content?: string;
  engine?: string;
  publishedDate?: string;
  thumbnail?: string;
  score?: number;
}

export interface SearXNGSearchResponse {
  results: SearXNGSearchResult[];
  query: string;
  number_of_results: number;
  suggestions?: string[];
  corrections?: string[];
  infoboxes?: unknown[];
}

export interface SearXNGEngine {
  name: string;
  categories: string[];
  enabled: boolean;
  shortcut?: string;
  language_support?: boolean;
  paging?: boolean;
  safesearch?: boolean;
  time_range_support?: boolean;
}

export interface SearXNGConfigResponse {
  categories: string[];
  engines: SearXNGEngine[];
  default_locale: string;
  locales: Record<string, string>;
  autocomplete: string;
  safe_search: number;
}

export class SearXNGClient {
  private baseUrl: string;
  private configCache: SearXNGConfigResponse | null = null;
  private configCacheTime: number = 0;
  private static CONFIG_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async search(params: SearXNGSearchParams): Promise<SearXNGSearchResult[]> {
    const url = new URL("/search", this.baseUrl);
    url.searchParams.set("q", params.query);
    url.searchParams.set("format", "json");

    if (params.categories && params.categories.length > 0) {
      url.searchParams.set("categories", params.categories.join(","));
    }

    if (params.engines && params.engines.length > 0) {
      url.searchParams.set("engines", params.engines.join(","));
    }

    if (params.language) {
      url.searchParams.set("language", params.language);
    }

    if (params.pageno) {
      url.searchParams.set("pageno", params.pageno.toString());
    }

    if (params.time_range) {
      url.searchParams.set("time_range", params.time_range);
    }

    if (params.safesearch !== undefined) {
      url.searchParams.set("safesearch", params.safesearch.toString());
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "User-Agent": "SearXNG-MCP/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`SearXNG search failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as SearXNGSearchResponse;
    return data.results || [];
  }

  private async fetchConfig(): Promise<SearXNGConfigResponse> {
    const now = Date.now();
    if (this.configCache && (now - this.configCacheTime) < SearXNGClient.CONFIG_CACHE_TTL_MS) {
      return this.configCache;
    }

    const url = new URL("/config", this.baseUrl);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "User-Agent": "SearXNG-MCP/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`SearXNG config fetch failed: ${response.status} ${response.statusText}`);
    }

    const config = await response.json() as SearXNGConfigResponse;
    this.configCache = config;
    this.configCacheTime = now;
    return config;
  }

  async getEngines(): Promise<SearXNGEngine[]> {
    const config = await this.fetchConfig();
    return config.engines || [];
  }

  async getCategories(): Promise<string[]> {
    const config = await this.fetchConfig();
    return config.categories || [];
  }
}

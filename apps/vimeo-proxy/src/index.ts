import puppeteer, { type Browser } from "@cloudflare/puppeteer";

interface Env {
  BROWSER: Fetcher;
  ALLOWED_ORIGINS: string;
  API_KEY?: string;
  VIMEO_COOKIES?: string; // Netscape cookie format, stored as a secret
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const allowedOrigins = (env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((s) => s.trim());
    const corsOrigin = allowedOrigins.includes(origin)
      ? origin
      : allowedOrigins[0] || "*";

    const corsHeaders = {
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-API-Key",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (url.pathname !== "/api/vimeo-url" || request.method !== "POST") {
      return Response.json(
        { error: "Not found. POST to /api/vimeo-url" },
        { status: 404, headers: corsHeaders },
      );
    }

    if (env.API_KEY) {
      const providedKey = request.headers.get("X-API-Key");
      if (providedKey !== env.API_KEY) {
        return Response.json(
          { error: "Unauthorized" },
          { status: 401, headers: corsHeaders },
        );
      }
    }

    let vimeoUrl: string;
    try {
      const body = (await request.json()) as { vimeo_url?: string };
      vimeoUrl = body.vimeo_url || "";
    } catch {
      return Response.json(
        { error: "Invalid JSON body. Expected { vimeo_url: string }" },
        { status: 400, headers: corsHeaders },
      );
    }

    const match = vimeoUrl.match(/vimeo\.com\/(\d+)/);
    if (!match) {
      return Response.json(
        { error: "Invalid Vimeo URL" },
        { status: 400, headers: corsHeaders },
      );
    }

    const videoId = match[1];

    try {
      const result = await extractVimeoUrls(env, videoId);
      return Response.json(result, { headers: corsHeaders });
    } catch (e: any) {
      console.error(`[VimeoProxy] Error: ${e.message}`);
      return Response.json(
        { error: e.message || "Failed to extract video URLs" },
        { status: 500, headers: corsHeaders },
      );
    }
  },
} satisfies ExportedHandler<Env>;

/**
 * Parse Netscape cookie format into Puppeteer cookie objects.
 */
function parseNetscapeCookies(cookieText: string): Array<{
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  expires: number;
}> {
  const cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    secure: boolean;
    httpOnly: boolean;
    expires: number;
  }> = [];

  for (const line of cookieText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Skip comments, but allow #HttpOnly_ prefix
    if (trimmed.startsWith("#") && !trimmed.startsWith("#HttpOnly_")) continue;

    const parts = trimmed.split("\t");
    if (parts.length < 7) continue;

    let domain = parts[0];
    const httpOnly = domain.startsWith("#HttpOnly_");
    if (httpOnly) {
      domain = domain.substring(10);
    }

    cookies.push({
      domain,
      httpOnly,
      path: parts[2],
      secure: parts[3] === "TRUE",
      expires: parseInt(parts[4], 10) || -1,
      name: parts[5],
      value: parts[6],
    });
  }

  return cookies;
}

async function extractVimeoUrls(
  env: Env,
  videoId: string,
): Promise<{ video_url?: string; audio_url?: string; error?: string }> {
  const playerUrl = `https://player.vimeo.com/video/${videoId}`;
  let browser: Browser | null = null;

  try {
    browser = await puppeteer.launch(env.BROWSER);
    const page = await browser.newPage();

    // Set a realistic User-Agent
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    );

    // Set cookies from the secret before navigating
    if (env.VIMEO_COOKIES) {
      const cookies = parseNetscapeCookies(env.VIMEO_COOKIES);
      console.log(`[VimeoProxy] Setting ${cookies.length} cookies`);

      // Navigate to vimeo.com first so cookies can be set on the domain
      await page.goto("https://vimeo.com", {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      for (const cookie of cookies) {
        try {
          await page.setCookie({
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain,
            path: cookie.path,
            secure: cookie.secure,
            httpOnly: cookie.httpOnly,
            ...(cookie.expires > 0 ? { expires: cookie.expires } : {}),
          });
        } catch (e: any) {
          console.warn(`[VimeoProxy] Failed to set cookie ${cookie.name}:`, e);
        }
      }

      // Verify cookies were set
      const setCookies = await page.cookies("https://player.vimeo.com");
      console.log(
        `[VimeoProxy] Cookies on player.vimeo.com: ${setCookies.length}`,
      );
    } else {
      console.log("[VimeoProxy] No VIMEO_COOKIES secret set");
    }

    // Set the referer to the whitelisted domain
    await page.setExtraHTTPHeaders({
      Referer:
        "https://www.viewroyal.ca/EN/main/town/council-committee-meetings/council-meetings.html",
    });

    // Intercept network requests to capture the config response
    let configData: any = null;
    page.on("response", async (response) => {
      const url = response.url();
      if (url.includes("/video/") && url.includes("/config")) {
        try {
          configData = await response.json();
          console.log("[VimeoProxy] Intercepted config response");
        } catch {
          // Config response wasn't JSON
        }
      }
    });

    // Navigate to the player page with the whitelisted referer
    console.log(`[VimeoProxy] Navigating to ${playerUrl}`);
    await page.goto(playerUrl, {
      waitUntil: "networkidle2",
      timeout: 30000,
      referer:
        "https://www.viewroyal.ca/EN/main/town/council-committee-meetings/council-meetings.html",
    });

    const pageTitle = await page.title();
    const currentUrl = page.url();
    console.log(`[VimeoProxy] Page title: "${pageTitle}", URL: ${currentUrl}`);

    // Log page content for debugging
    const bodyText2 = await page.evaluate(
      () => document.body?.innerText?.slice(0, 300) || "empty",
    );
    console.log(`[VimeoProxy] Page content: ${bodyText2}`);

    // If we caught the config via network interception, use it
    if (configData) {
      console.log("[VimeoProxy] Got config from network interception");
      return parseConfig(configData);
    }

    // Check if we're on the Turnstile page
    const bodyText = await page.evaluate(
      () => document.body?.innerText?.slice(0, 200) || "",
    );

    if (bodyText.includes("couldn't verify")) {
      // Turnstile challenge — wait for it to solve and redirect
      console.log("[VimeoProxy] Turnstile detected, waiting for redirect...");
      try {
        await page.waitForNavigation({
          waitUntil: "networkidle2",
          timeout: 25000,
        });
        // Check config again after redirect
        if (configData) {
          console.log("[VimeoProxy] Got config after Turnstile redirect");
          return parseConfig(configData);
        }
      } catch {
        console.log("[VimeoProxy] Turnstile navigation timeout");
      }
    }

    // Wait for any remaining JS execution
    await new Promise((r) => setTimeout(r, 2000));

    // Check config one more time
    if (configData) {
      console.log("[VimeoProxy] Got config after wait");
      return parseConfig(configData);
    }

    // Try to extract config from the page's JavaScript context
    const extracted = await page.evaluate(() => {
      const win = window as any;
      if (win.playerConfig) return win.playerConfig;
      if (win.vimeo?.clip_page_config?.clip?.video?.config) {
        return win.vimeo.clip_page_config.clip.video.config;
      }
      const scripts = document.querySelectorAll("script");
      for (const script of scripts) {
        const text = script.textContent || "";
        const configMatch = text.match(/var config\s*=\s*({[\s\S]*?});/);
        if (configMatch) {
          try {
            return JSON.parse(configMatch[1]);
          } catch {
            // Not valid JSON
          }
        }
      }
      return null;
    });

    if (extracted) {
      console.log("[VimeoProxy] Got config from page evaluation");
      return parseConfig(extracted);
    }

    // Last resort: fetch /config from within browser (has cookies set)
    console.log("[VimeoProxy] Trying /config fetch from browser context");
    const configFromFetch = await page.evaluate(async (id: string) => {
      try {
        const resp = await fetch(
          `https://player.vimeo.com/video/${id}/config`,
          { credentials: "include" },
        );
        if (resp.ok) return resp.json();
      } catch {
        // Fetch failed
      }
      return null;
    }, videoId);

    if (configFromFetch) {
      console.log("[VimeoProxy] Got config from in-browser fetch");
      return parseConfig(configFromFetch);
    }

    return { error: "Could not extract video config" };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

function parseConfig(config: any): { video_url?: string; audio_url?: string } {
  // HLS manifest URL
  const hlsCdns = config?.request?.files?.hls?.cdns;
  if (hlsCdns) {
    const defaultCdn = config?.request?.files?.hls?.default_cdn;
    const cdn = hlsCdns[defaultCdn] || hlsCdns[Object.keys(hlsCdns)[0]];
    if (cdn?.url) {
      console.log("[VimeoProxy] Found HLS URL");
      return { video_url: cdn.url };
    }
  }

  // Progressive (MP4) URLs
  const progressive = config?.request?.files?.progressive;
  if (progressive && Array.isArray(progressive) && progressive.length > 0) {
    progressive.sort((a: any, b: any) => (b.height || 0) - (a.height || 0));
    console.log("[VimeoProxy] Found progressive MP4 URL");
    return { video_url: progressive[0].url };
  }

  // DASH
  const dash = config?.request?.files?.dash;
  if (dash?.cdns) {
    const defaultCdn = dash.default_cdn;
    const cdn = dash.cdns[defaultCdn] || dash.cdns[Object.keys(dash.cdns)[0]];
    if (cdn?.url) {
      console.log("[VimeoProxy] Found DASH URL");
      return { video_url: cdn.url };
    }
  }

  return { error: "No video URLs found in config" };
}

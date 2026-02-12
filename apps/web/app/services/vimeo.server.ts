import { getSupabaseAdminClient } from "../lib/supabase.server";

const VIMEO_TOKEN = process.env.VIMEO_TOKEN;
// VIMEO_PROXY_URL and VIMEO_PROXY_API_KEY are accessed dynamically inside functions

export interface VimeoVideoData {
  name: string;
  description: string;
  duration: number;
  width: number;
  height: number;
  link: string; // The public link
  files?: Array<{
    quality: string;
    type: string;
    width: number;
    height: number;
    link: string; // The direct link
    created_time: string;
    fps: number;
    size: number;
    size_short: string;
  }>;
  direct_url?: string;
  direct_audio_url?: string;
}

// Simple in-memory cache to prevent reloading video on every action
interface CacheEntry {
  data: any;
  timestamp: number;
}
const urlCache = new Map<string, CacheEntry>();
const CACHE_TTL = 3600 * 1000; // 1 hour
const DB_CACHE_TTL = 3 * 3600 * 1000; // 3 hours (Vimeo links expire)

/**
 * Clears the in-memory cache for a given video URL.
 * Called when a video failure is reported to ensure fresh URLs are fetched.
 */
export function clearVimeoCache(videoUrl: string): void {
  urlCache.delete(`data:${videoUrl}`);
  urlCache.delete(`thumb:${videoUrl}`);
}

/**
 * Fetches the thumbnail for a Vimeo video, using DB cache if available.
 */
export async function getVimeoThumbnail(
  videoUrl: string,
  meetingId?: number | string,
): Promise<string | null> {
  const supabaseAdmin = getSupabaseAdminClient();
  // 1. Check In-Memory Cache
  const memCached = urlCache.get(`thumb:${videoUrl}`);
  if (memCached && Date.now() - memCached.timestamp < CACHE_TTL) {
    return memCached.data;
  }

  // 2. Check Database Cache
  if (meetingId) {
    try {
      const { data: meeting } = await supabaseAdmin
        .from("meetings")
        .select("meta")
        .eq("id", meetingId)
        .single();

      if (meeting?.meta && (meeting.meta as any).vimeo_thumbnail_url) {
        const thumb = (meeting.meta as any).vimeo_thumbnail_url;
        urlCache.set(`thumb:${videoUrl}`, {
          data: thumb,
          timestamp: Date.now(),
        });
        return thumb;
      }
    } catch (e) {
      console.warn("[Vimeo] Error checking thumbnail DB cache:", e);
    }
  }

  // 3. Fetch from Vimeo oembed
  try {
    const response = await fetch(
      `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(videoUrl)}`,
    );
    if (!response.ok) return null;
    const data: any = await response.json();
    const thumbnailUrl = data.thumbnail_url || null;

    if (thumbnailUrl) {
      urlCache.set(`thumb:${videoUrl}`, {
        data: thumbnailUrl,
        timestamp: Date.now(),
      });

      // Save to DB Cache if meetingId is provided
      if (meetingId) {
        try {
          const { data: currentMeeting } = await supabaseAdmin
            .from("meetings")
            .select("meta")
            .eq("id", meetingId)
            .single();

          const currentMeta = (currentMeeting?.meta as any) || {};
          const newMeta = {
            ...currentMeta,
            vimeo_thumbnail_url: thumbnailUrl,
          };

          await supabaseAdmin
            .from("meetings")
            .update({ meta: newMeta })
            .eq("id", meetingId);
        } catch (e) {
          console.warn("[Vimeo] Error saving thumbnail to DB cache:", e);
        }
      }
    }

    return thumbnailUrl;
  } catch (error) {
    console.error("[Vimeo] Error fetching oembed thumbnail:", error);
    return null;
  }
}

/**
 * Fetches direct video/audio URLs for a Vimeo video.
 */
export async function getVimeoVideoData(
  videoUrl: string,
  meetingId?: number | string,
): Promise<VimeoVideoData | null> {
  try {
    const supabaseAdmin = getSupabaseAdminClient();
    console.log(
      `[Vimeo] getVimeoVideoData called for: ${videoUrl}, meetingId: ${meetingId}`,
    );

    // 1. Check In-Memory Cache (but skip if we need to verify DB invalidation)
    const cached = urlCache.get(`data:${videoUrl}`);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      // Still need to check if cache was invalidated in DB
      if (meetingId) {
        try {
          const { data: meeting } = await supabaseAdmin
            .from("meetings")
            .select("meta")
            .eq("id", meetingId)
            .single();

          const meta = meeting?.meta as any;
          if (meta?.vimeo_cache_invalidated_at) {
            const invalidatedAt = new Date(
              meta.vimeo_cache_invalidated_at,
            ).getTime();
            if (invalidatedAt > cached.timestamp) {
              console.log(
                `[Vimeo] In-memory cache invalidated by DB flag, fetching fresh`,
              );
              urlCache.delete(`data:${videoUrl}`);
              // Fall through to fetch fresh URL
            } else {
              console.log(`[Vimeo] Returning from in-memory cache`);
              return cached.data;
            }
          } else {
            console.log(`[Vimeo] Returning from in-memory cache`);
            return cached.data;
          }
        } catch (e) {
          // If DB check fails, still use cache
          console.log(
            `[Vimeo] Returning from in-memory cache (DB check failed)`,
          );
          return cached.data;
        }
      } else {
        console.log(`[Vimeo] Returning from in-memory cache`);
        return cached.data;
      }
    }

    // 2. Check Database Cache
    console.log(`[Vimeo] Checking DB cache...`);
    let staleData: VimeoVideoData | null = null;

    if (meetingId) {
      try {
        const { data: meeting } = await supabaseAdmin
          .from("meetings")
          .select("meta")
          .eq("id", meetingId)
          .single();

        console.log(
          `[Vimeo] DB meta keys:`,
          meeting?.meta ? Object.keys(meeting.meta as object) : "no meta",
        );

        if (meeting?.meta && (meeting.meta as any).vimeo_direct_url) {
          const meta = meeting.meta as any;

          // Check if cache was invalidated after the URL was fetched
          const urlUpdatedAt = meta.vimeo_direct_url_updated_at
            ? new Date(meta.vimeo_direct_url_updated_at).getTime()
            : 0;
          const invalidatedAt = meta.vimeo_cache_invalidated_at
            ? new Date(meta.vimeo_cache_invalidated_at).getTime()
            : 0;

          // Capture potential stale data
          staleData = {
            name: "Cached Video",
            description: "",
            duration: 0,
            width: 0,
            height: 0,
            link: videoUrl,
            direct_url: meta.vimeo_direct_url,
            direct_audio_url: meta.vimeo_direct_audio_url,
          };

          const isExpired = Date.now() - urlUpdatedAt > DB_CACHE_TTL;

          if (invalidatedAt > urlUpdatedAt) {
            console.log(
              `[Vimeo] DB cache invalidated (manual flag), fetching fresh URL`,
            );
            // Don't return - fall through to fetch fresh URL
          } else if (isExpired) {
            console.log(`[Vimeo] DB cache expired (>3h), fetching fresh URL`);
            // Don't return - fall through to fetch fresh URL
          } else {
            console.log(`[Vimeo] Returning from DB cache`);
            const result: VimeoVideoData = {
              name: "Cached Video",
              description: "",
              duration: 0,
              width: 0,
              height: 0,
              link: videoUrl,
              direct_url: meta.vimeo_direct_url,
              direct_audio_url: meta.vimeo_direct_audio_url,
            };
            urlCache.set(`data:${videoUrl}`, {
              data: result,
              timestamp: Date.now(),
            });
            return result;
          }
        }
      } catch (e) {
        console.warn("[Vimeo] Error checking video data DB cache:", e);
      }
    }

    console.log(
      `[Vimeo] No valid cache, proceeding to fetch. VIMEO_TOKEN set: ${!!VIMEO_TOKEN}`,
    );

    if (!VIMEO_TOKEN) {
      console.log("[Vimeo] No VIMEO_TOKEN, using fallback methods...");
      const fallback = await getDirectUrlFallback(videoUrl).catch((e) => {
        console.warn(`[Vimeo] Fallback failed: ${e}`);
        return null;
      });
      console.log("[Vimeo] Fallback result:", fallback ? "got URLs" : "failed");
      if (fallback) {
        const result: VimeoVideoData = {
          name: "Fallback Video",
          description: "",
          duration: 0,
          width: 0,
          height: 0,
          link: videoUrl,
          direct_url: fallback.video,
          direct_audio_url: fallback.audio,
        };

        // Cache the result
        urlCache.set(`data:${videoUrl}`, {
          data: result,
          timestamp: Date.now(),
        });

        // Save to DB Cache
        if (meetingId) {
          try {
            const { data: currentMeeting } = await supabaseAdmin
              .from("meetings")
              .select("meta")
              .eq("id", meetingId)
              .single();

            const currentMeta = (currentMeeting?.meta as any) || {};
            const newMeta = {
              ...currentMeta,
              vimeo_direct_url: fallback.video,
              vimeo_direct_audio_url: fallback.audio,
              vimeo_direct_url_updated_at: new Date().toISOString(),
            };

            await supabaseAdmin
              .from("meetings")
              .update({ meta: newMeta })
              .eq("id", meetingId);
          } catch (e) {
            console.warn("[Vimeo] Error saving fallback URL to DB:", e);
          }
        }

        return result;
      }

      if (staleData) {
        console.warn(
          "[Vimeo] Fallback failed (likely rate limit), returning stale data from DB",
        );
        return staleData;
      }
      return null;
    }

    // 3. Extract ID and fetch from Vimeo API
    const match = videoUrl.match(/vimeo\.com\/(\d+)/);
    if (!match) return null;
    const videoId = match[1];

    try {
      const response = await fetch(`https://api.vimeo.com/videos/${videoId}`, {
        headers: {
          Authorization: `Bearer ${VIMEO_TOKEN}`,
          Accept: "application/vnd.vimeo.*+json;version=3.4",
        },
      });

      if (!response.ok) {
        console.warn(
          `[Vimeo] API returned ${response.status}, trying fallback`,
        );
        const fallback = await getDirectUrlFallback(videoUrl).catch(() => null);
        if (fallback) {
          return {
            name: "Fallback Video",
            description: "",
            duration: 0,
            width: 0,
            height: 0,
            link: videoUrl,
            direct_url: fallback.video,
            direct_audio_url: fallback.audio,
          };
        }

        if (staleData) {
          console.warn("[Vimeo] Fallback failed, returning stale data");
          return staleData;
        }
        return null;
      }

      const data: any = await response.json();
      let directUrl = null;

      console.log(
        `[Vimeo] API response - has files: ${!!data.files}, file count: ${data.files?.length || 0}`,
      );

      if (data.files && Array.isArray(data.files)) {
        const hls = data.files.find(
          (f: any) => f.quality === "hls" || f.type === "application/x-mpegurl",
        );
        if (hls) {
          directUrl = hls.link;
        } else {
          const mp4Files = data.files.filter(
            (f: any) => f.type === "video/mp4",
          );
          if (mp4Files.length > 0) {
            mp4Files.sort((a: any, b: any) => (b.width || 0) - (a.width || 0));
            directUrl = mp4Files[0].link;
          }
        }
      }

      // If Vimeo API didn't return direct URLs (domain-restricted), use fallback
      if (!directUrl) {
        console.log(`[Vimeo] API returned no direct URLs, trying fallback`);
        const fallback = await getDirectUrlFallback(videoUrl).catch(() => null);
        if (fallback) {
          const fallbackResult: VimeoVideoData = {
            ...data,
            direct_url: fallback.video,
            direct_audio_url: fallback.audio,
          };

          urlCache.set(`data:${videoUrl}`, {
            data: fallbackResult,
            timestamp: Date.now(),
          });

          // Save to DB Cache
          if (meetingId) {
            try {
              const { data: currentMeeting } = await supabaseAdmin
                .from("meetings")
                .select("meta")
                .eq("id", meetingId)
                .single();

              const currentMeta = (currentMeeting?.meta as any) || {};
              const newMeta = {
                ...currentMeta,
                vimeo_direct_url: fallback.video,
                vimeo_direct_audio_url: fallback.audio,
                vimeo_direct_url_updated_at: new Date().toISOString(),
              };

              await supabaseAdmin
                .from("meetings")
                .update({ meta: newMeta })
                .eq("id", meetingId);
            } catch (e) {
              console.warn("[Vimeo] Error saving fallback URL to DB:", e);
            }
          }

          return fallbackResult;
        }

        if (staleData) {
          console.warn("[Vimeo] Fallback failed, returning stale data");
          return staleData;
        }
      }

      const result: VimeoVideoData = {
        ...data,
        direct_url: directUrl || undefined,
      };

      urlCache.set(`data:${videoUrl}`, { data: result, timestamp: Date.now() });

      // Save to DB Cache
      if (meetingId && result.direct_url) {
        try {
          const { data: currentMeeting } = await supabaseAdmin
            .from("meetings")
            .select("meta")
            .eq("id", meetingId)
            .single();

          const currentMeta = (currentMeeting?.meta as any) || {};
          const newMeta = {
            ...currentMeta,
            vimeo_direct_url: result.direct_url,
            vimeo_direct_url_updated_at: new Date().toISOString(),
          };

          await supabaseAdmin
            .from("meetings")
            .update({ meta: newMeta })
            .eq("id", meetingId);
        } catch (e) {
          console.warn("[Vimeo] Error saving direct URL to DB:", e);
        }
      }

      return result;
    } catch (e) {
      console.error("[Vimeo] API Exception", e);
      if (staleData) {
        console.warn("[Vimeo] API Exception, returning stale data");
        return staleData;
      }
      return null;
    }
  } catch (criticalError) {
    console.error(
      "[CRITICAL VIMEO ERROR] getVimeoVideoData crashed:",
      criticalError,
    );
    return null;
  }
}

/**
 * Fetches direct URLs via Vimeo's player config endpoint.
 * This is what Vimeo's own embedded player uses to get HLS/MP4 URLs.
 * Works in all environments (including Cloudflare Workers) — no external proxy needed.
 * Uses the whitelisted domain as Referer to pass domain-restriction checks.
 */
async function getDirectUrlViaPlayerConfig(
  videoUrl: string,
): Promise<{ video: string; audio?: string } | null> {
  const match = videoUrl.match(/vimeo\.com\/(\d+)/);
  if (!match) return null;
  const videoId = match[1];

  try {
    console.log(`[Vimeo] Fetching player config for video ${videoId}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(
      `https://player.vimeo.com/video/${videoId}/config`,
      {
        headers: {
          Referer: "https://www.viewroyal.ca/",
          Origin: "https://www.viewroyal.ca",
          Accept: "application/json",
        },
        signal: controller.signal,
      },
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[Vimeo] Player config returned ${response.status}`);
      return null;
    }

    const config: any = await response.json();

    // Look for HLS manifest URL in the CDN config
    const hlsCdns = config?.request?.files?.hls?.cdns;
    if (hlsCdns) {
      // Pick the default CDN or the first available one
      const defaultCdn = config?.request?.files?.hls?.default_cdn;
      const cdn = hlsCdns[defaultCdn] || hlsCdns[Object.keys(hlsCdns)[0]];
      if (cdn?.url) {
        console.log("[Vimeo] Got HLS URL from player config");
        return { video: cdn.url };
      }
    }

    // Fallback: look for progressive (MP4) URLs
    const progressive = config?.request?.files?.progressive;
    if (progressive && Array.isArray(progressive) && progressive.length > 0) {
      // Sort by height descending, pick the best quality
      progressive.sort((a: any, b: any) => (b.height || 0) - (a.height || 0));
      console.log("[Vimeo] Got progressive MP4 URL from player config");
      return { video: progressive[0].url };
    }

    // Fallback: look for DASH URLs
    const dash = config?.request?.files?.dash;
    if (dash?.cdns) {
      const defaultCdn = dash.default_cdn;
      const cdn = dash.cdns[defaultCdn] || dash.cdns[Object.keys(dash.cdns)[0]];
      if (cdn?.url) {
        console.log("[Vimeo] Got DASH URL from player config");
        return { video: cdn.url };
      }
    }

    return null;
  } catch (e) {
    console.warn(`[Vimeo] Player config fetch failed: ${e}`);
    return null;
  }
}

async function getDirectUrlViaProxy(
  videoUrl: string,
  proxyUrlOverride?: string,
  apiKeyOverride?: string,
): Promise<{ video: string; audio?: string } | null> {
  const VIMEO_PROXY_URL = proxyUrlOverride || process.env.VIMEO_PROXY_URL;
  const VIMEO_PROXY_API_KEY = apiKeyOverride || process.env.VIMEO_PROXY_API_KEY;

  if (!VIMEO_PROXY_URL) {
    return null;
  }

  try {
    console.log(`[Vimeo] Fetching via proxy: ${VIMEO_PROXY_URL}`);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (VIMEO_PROXY_API_KEY) {
      headers["X-API-Key"] = VIMEO_PROXY_API_KEY;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000); // Browser rendering can take 30s+

    const response = await fetch(`${VIMEO_PROXY_URL}/api/vimeo-url`, {
      method: "POST",
      headers,
      body: JSON.stringify({ vimeo_url: videoUrl }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[Vimeo] Proxy returned ${response.status}`);
      return null;
    }

    const data: any = await response.json();

    if (data.error) {
      console.warn(`[Vimeo] Proxy error: ${data.error}`);
      return null;
    }

    if (data.video_url) {
      console.log("[Vimeo] Got URLs from proxy");
      return {
        video: data.video_url,
        audio: data.audio_url,
      };
    }

    return null;
  } catch (e) {
    console.warn(`[Vimeo] Proxy request failed: ${e}`);
    return null;
  }
}

/**
 * Fetches direct URLs via local yt-dlp execution.
 * Only works in Node.js environments with yt-dlp installed.
 * Uses dynamic imports so this module can be loaded on Cloudflare Workers.
 */
async function getDirectUrlViaYtDlp(
  videoUrl: string,
): Promise<{ video: string; audio?: string } | null> {
  // fast path for Workers/Edge
  if (typeof process === "undefined" || !process.versions?.node) {
    return null;
  }

  try {
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const path = await import("path");
    const execAsync = promisify(exec);

    const projectRoot = path.resolve(process.cwd(), "../../");
    // Prefer 360p for faster loading, fallback to 480p
    const cmd = `uv run yt-dlp --cookies-from-browser chrome -f "bestvideo[height<=360]+bestaudio/bestvideo[height<=480]+bestaudio/best[height<=480]" -g "${videoUrl}"`;

    const { stdout } = await execAsync(cmd, {
      cwd: projectRoot,
      maxBuffer: 10 * 1024 * 1024,
      timeout: 15000, // 15 second timeout
    });

    if (stdout) {
      const lines = stdout.trim().split("\n");
      if (lines.length > 0) {
        const video = lines[0].trim();
        let audio: string | undefined;
        if (lines.length > 1 && lines[1].trim().startsWith("http")) {
          audio = lines[1].trim();
        }
        if (video.startsWith("http")) return { video, audio };
      }
    }
  } catch (e) {
    console.warn(`[Vimeo] yt-dlp fallback failed: ${e}`);
  }
  return null;
}

/**
 * Attempts to get direct URLs using available methods in priority order:
 * 1. Vimeo player config endpoint (works for non-Turnstile-protected videos)
 * 2. Primary proxy service - Cloudflare Browser Rendering (VIMEO_PROXY_URL)
 * 3. Fallback proxy service - Render (VIMEO_PROXY_FALLBACK_URL)
 * 4. Local yt-dlp (Node.js local dev only)
 */
async function getDirectUrlFallback(
  videoUrl: string,
): Promise<{ video: string; audio?: string } | null> {
  try {
    // Try player config first (works for unrestricted videos, no external deps)
    const configResult = await getDirectUrlViaPlayerConfig(videoUrl).catch(
      () => null,
    );
    if (configResult) {
      return configResult;
    }

    // Try primary proxy service (Cloudflare Browser Rendering)
    const proxyResult = await getDirectUrlViaProxy(videoUrl).catch(() => null);
    if (proxyResult) {
      return proxyResult;
    }

    // Try fallback proxy service (Render)
    const fallbackProxyUrl = process.env.VIMEO_PROXY_FALLBACK_URL;
    if (fallbackProxyUrl) {
      console.log(`[Vimeo] Primary proxy failed, trying fallback proxy`);
      const fallbackApiKey = process.env.VIMEO_PROXY_FALLBACK_API_KEY;
      const fallbackResult = await getDirectUrlViaProxy(
        videoUrl,
        fallbackProxyUrl,
        fallbackApiKey,
      ).catch(() => null);
      if (fallbackResult) {
        return fallbackResult;
      }
    }

    // Fall back to local yt-dlp (Node.js only)
    return getDirectUrlViaYtDlp(videoUrl).catch(() => null);
  } catch (e) {
    console.warn(`[Vimeo] Fallback failed completely: ${e}`);
    return null;
  }
}

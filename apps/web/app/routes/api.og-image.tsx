import { ImageResponse } from "workers-og";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function typeLabel(type: string): string {
  switch (type) {
    case "meeting":
      return "Council Meeting";
    case "person":
      return "Council Member";
    case "search":
      return "Search Result";
    case "bylaw":
      return "Bylaw";
    case "matter":
      return "Council Matter";
    case "election":
      return "Election";
    default:
      return "ViewRoyal.ai";
  }
}

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const title = url.searchParams.get("title") || "ViewRoyal.ai";
  const subtitle = url.searchParams.get("subtitle") || "";
  const type = url.searchParams.get("type") || "default";

  const fontSize = title.length > 60 ? 42 : 56;

  const html = `
    <div style="display: flex; flex-direction: column; width: 1200px; height: 630px; background: linear-gradient(135deg, #18181b 0%, #27272a 100%); padding: 60px; justify-content: space-between; font-family: 'Inter', sans-serif;">
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="background: #2563eb; color: white; font-size: 14px; font-weight: 800; padding: 6px 16px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.1em;">
            ${escapeHtml(typeLabel(type))}
          </div>
        </div>
        <div style="color: white; font-size: ${fontSize}px; font-weight: 900; line-height: 1.1; max-width: 1000px; overflow: hidden;">
          ${escapeHtml(title)}
        </div>
        ${subtitle ? `<div style="color: #a1a1aa; font-size: 24px; font-weight: 600;">${escapeHtml(subtitle)}</div>` : ""}
      </div>
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="color: #3b82f6; font-size: 28px; font-weight: 900;">ViewRoyal.ai</div>
          <div style="color: #52525b; font-size: 18px; font-weight: 500;">Council Meeting Intelligence</div>
        </div>
      </div>
    </div>
  `;

  return new ImageResponse(html, {
    width: 1200,
    height: 630,
    headers: {
      "Cache-Control": "public, max-age=86400, s-maxage=604800",
    },
  });
}

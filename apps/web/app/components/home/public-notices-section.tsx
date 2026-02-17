import { Bell, ArrowRight, ExternalLink } from "lucide-react";

interface PublicNoticesSectionProps {
  notices: Array<{ title: string; link: string; date: string }>;
  websiteUrl?: string;
}

export function PublicNoticesSection({
  notices,
  websiteUrl,
}: PublicNoticesSectionProps) {
  if (!notices || notices.length === 0) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-black uppercase tracking-widest text-zinc-400 flex items-center gap-2">
          <Bell className="h-4 w-4" />
          Public Notices
        </h2>
        {websiteUrl && (
          <a
            href={`${websiteUrl}/EN/main/town/public.html`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline font-semibold"
          >
            View all
          </a>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden divide-y divide-zinc-100">
        {notices.map((notice, i) => (
          <a
            key={i}
            href={notice.link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-4 hover:bg-zinc-50 transition-colors group"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-zinc-900 group-hover:text-blue-600 transition-colors line-clamp-2">
                {notice.title}
              </p>
              <p className="text-xs text-zinc-400 mt-1">
                {new Date(notice.date).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
            <ExternalLink className="h-4 w-4 text-zinc-300 group-hover:text-blue-600 transition-colors shrink-0" />
          </a>
        ))}
      </div>
    </section>
  );
}

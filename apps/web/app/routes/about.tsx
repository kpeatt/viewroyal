import { useLoaderData } from "react-router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { Link } from "react-router";
import {
  Mail,
  ArrowLeft,
  Calendar,
  Gavel,
  Activity,
  Timer,
  MessageSquare,
  Github,
} from "lucide-react";
import { createSupabaseServerClient } from "../lib/supabase.server";
import { getAboutStats } from "../services/site";
import aboutContent from "../content/about.md?raw";

export async function loader({ request }: { request: Request }) {
  let stats = null;
  try {
    const { supabase } = createSupabaseServerClient(request);
    stats = await getAboutStats(supabase);
  } catch (error) {
    console.error("Error loading about stats:", error);
  }
  return { content: aboutContent, stats };
}

const statItems = [
  { key: "meetings", label: "Meetings Analyzed", icon: Calendar },
  { key: "motions", label: "Motions Tracked", icon: Gavel },
  { key: "matters", label: "Matters Followed", icon: Activity },
  { key: "hours", label: "Video Hours Transcribed", icon: Timer },
  { key: "segments", label: "Transcript Segments", icon: MessageSquare },
] as const;

export default function About() {
  const { content, stats } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-zinc-50 pb-20">
      {/* Header */}
      <div className="bg-zinc-900 text-white py-20 px-4">
        <div className="container mx-auto max-w-4xl text-center">
          <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-6">
            About ViewRoyal<span className="text-blue-500">.ai</span>
          </h1>
          <p className="text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed font-medium">
            Project documentation and mission overview.
          </p>
        </div>
      </div>

      <div className="container mx-auto max-w-4xl px-4 -mt-10">
        {/* Stats Grid */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
            {statItems.map(({ key, label, icon: Icon }) => (
              <div
                key={key}
                className="bg-white rounded-2xl p-4 shadow-lg border border-zinc-200 text-center"
              >
                <Icon className="h-5 w-5 text-blue-500 mx-auto mb-2" />
                <div className="text-2xl font-black text-zinc-900">
                  {stats[key].toLocaleString()}
                </div>
                <div className="text-xs font-medium text-zinc-500 mt-1">
                  {label}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="bg-white rounded-3xl p-8 md:p-12 shadow-xl border border-zinc-200 mb-12">
          <article
            className="prose prose-zinc lg:prose-lg max-w-none
            prose-headings:text-zinc-900 prose-headings:font-black
            prose-p:text-zinc-600 prose-p:leading-relaxed
            prose-li:text-zinc-600
            prose-strong:text-zinc-900 prose-strong:font-bold
            prose-blockquote:border-blue-500 prose-blockquote:bg-blue-50/50 prose-blockquote:py-1 prose-blockquote:px-6 prose-blockquote:rounded-r-xl prose-blockquote:not-italic
            prose-hr:border-zinc-100
            prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline
          "
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw]}
            >
              {content}
            </ReactMarkdown>
          </article>

          <div className="mt-12 pt-12 border-t border-zinc-100 flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-zinc-100 rounded-full">
                <Mail className="h-5 w-5 text-zinc-600" />
              </div>
              <div>
                <div className="text-sm font-bold text-zinc-900">
                  Questions?
                </div>
                <a
                  href="mailto:kyle@viewroyal.ai"
                  className="text-sm text-zinc-500 hover:text-blue-600 transition-colors"
                >
                  kyle@viewroyal.ai
                </a>
              </div>
            </div>

            <Link
              to="/"
              className="flex items-center gap-2 px-6 py-3 bg-zinc-900 text-white rounded-full font-bold hover:bg-zinc-800 transition-all hover:gap-3"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

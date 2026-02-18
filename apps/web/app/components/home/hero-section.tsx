import { Link } from "react-router";
import { AskQuestion } from "../ask-question";

interface HeroSectionProps {
  shortName: string;
  user: any;
}

export function HeroSection({ shortName, user }: HeroSectionProps) {
  return (
    <div className="relative bg-gradient-to-b from-blue-600 to-blue-700 text-white overflow-hidden">
      {/* Map background with Ken Burns animation */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute inset-[-10%] bg-cover bg-center"
          style={{
            backgroundImage: 'url(/view-royal-map.svg)',
            animation: 'ken-burns 35s ease-in-out infinite',
          }}
        />
        {/* Gradient overlays for stylized/faded look */}
        <div className="absolute inset-0 bg-blue-700/70" />
        <div className="absolute inset-0 bg-gradient-to-b from-blue-600/80 via-blue-700/60 to-blue-800/90" />
        <div className="absolute inset-0 bg-gradient-to-r from-blue-700/40 via-transparent to-blue-700/40" />
      </div>

      <div className="relative container mx-auto px-4 py-12 md:py-16 max-w-5xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight mb-4">
            What's happening in {shortName}?
          </h1>
          <p className="text-blue-100 text-base md:text-lg max-w-2xl mx-auto">
            Explore council meetings, decisions, and debates. Get instant
            answers analyzed from official records and transcripts.
          </p>
        </div>

        {/* Prominent Ask Interface */}
        <div className="max-w-5xl mx-auto">
          <AskQuestion
            title=""
            placeholder={`Ask anything about ${shortName} council decisions...`}
            className="bg-white text-zinc-900 shadow-2xl border-0"
          />
        </div>

        {/* Account CTA for logged-out users */}
        {!user && (
          <div className="text-center mt-6">
            <Link
              to="/signup"
              className="inline-flex items-center text-sm text-blue-200 hover:text-white transition-colors underline underline-offset-2"
            >
              Create an account to track what matters to you
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

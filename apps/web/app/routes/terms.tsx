import { Link, useRouteLoaderData } from "react-router";
import type { Municipality } from "../lib/types";

export default function Terms() {
  const rootData = useRouteLoaderData("root") as { municipality?: Municipality } | undefined;
  const shortName = rootData?.municipality?.short_name || "View Royal";
  return (
    <main className="container mx-auto py-16 px-4 max-w-3xl">
      <h1 className="text-4xl font-black mb-8">Terms of Service</h1>
      <div className="prose prose-zinc lg:prose-xl">
        <p className="lead font-bold">Last Updated: February 10, 2026</p>

        <h2 className="text-2xl font-bold mt-8 mb-4">1. Accuracy of Data</h2>
        <p>
          ViewRoyal.ai is an independent platform. While we strive for 100%
          accuracy, our data is processed using AI and automated tools. It
          should be used for informational purposes only. For official legal
          records, please consult the
          <a
            href="https://viewroyalbc.civicweb.net/portal/"
            className="text-blue-600 ml-1"
            target="_blank"
            rel="noopener noreferrer"
          >
            Official {shortName} CivicWeb Portal
          </a>
          .
        </p>

        <h2 className="text-2xl font-bold mt-8 mb-4">
          2. Intellectual Property
        </h2>
        <p>
          The underlying data is public record. The specific visual
          presentations, analysis, and AI-generated insights are property of
          ViewRoyal.ai.
        </p>

        <h2 className="text-2xl font-bold mt-8 mb-4">
          3. Limitation of Liability
        </h2>
        <p>
          We are not liable for any decisions made based on the information
          presented on this platform.
        </p>

        <div className="mt-12 p-6 bg-zinc-100 rounded-xl">
          <p className="text-sm text-zinc-600 italic">
            This is a placeholder agreement. Please review with legal counsel if
            necessary.
          </p>
        </div>

        <div className="mt-8">
          <Link to="/" className="text-blue-600 font-bold hover:underline">
            ← Back to Home
          </Link>
        </div>
      </div>
    </main>
  );
}

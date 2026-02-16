import { Link, useRouteLoaderData } from "react-router";
import type { Municipality } from "../lib/types";

export default function Privacy() {
  const rootData = useRouteLoaderData("root") as { municipality?: Municipality } | undefined;
  const municipalityName = rootData?.municipality?.name || "Town of View Royal";
  return (
    <main className="container mx-auto py-16 px-4 max-w-3xl">
      <h1 className="text-4xl font-black mb-8">Privacy Policy</h1>
      <div className="prose prose-zinc lg:prose-xl">
        <p className="lead font-bold">Last Updated: February 10, 2026</p>

        <h2 className="text-2xl font-bold mt-8 mb-4">1. Data Collection</h2>
        <p>
          ViewRoyal.ai primarily aggregates data from public records provided by
          the {municipalityName}. This includes meeting agendas, minutes, voting
          records, and public video broadcasts.
        </p>

        <h2 className="text-2xl font-bold mt-8 mb-4">
          2. Personal Information
        </h2>
        <p>
          We do not collect personal information from visitors to this site
          unless you explicitly provide it (e.g., via contact forms). We use
          industry-standard cookies for session management and basic analytics.
        </p>

        <h2 className="text-2xl font-bold mt-8 mb-4">3. Third Parties</h2>
        <p>
          We use Supabase for data storage and authentication, and Vimeo for
          video hosting. Please refer to their respective privacy policies for
          more information.
        </p>

        <div className="mt-12 p-6 bg-zinc-100 rounded-xl">
          <p className="text-sm text-zinc-600 italic">
            This is a placeholder policy. Before going live, please ensure this
            accurately reflects your actual data handling practices.
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

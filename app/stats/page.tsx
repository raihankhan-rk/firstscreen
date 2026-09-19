import Link from "next/link";
import { getStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

export default async function StatsPage() {
  const stats = await getStats();

  return (
    <main className="stats-page">
      <Link className="brand" href="/" aria-label="Back to FirstScreen">
        <span className="brand-mark">F</span>
        <span>FirstScreen</span>
      </Link>
      <section className="stats-card">
        <p className="section-kicker">Anonymous counter</p>
        <h1>{stats.judges.toLocaleString("en-US")}</h1>
        <h2>URLs judged</h2>
        <p>
          Successful Jev audits since this counter started. No identities, URLs, or results are stored.
        </p>
        <span className="stats-persistence">
          {stats.persistence === "volume" ? "Durable Railway volume" : "Temporary local storage"}
        </span>
      </section>
      <Link className="stats-back" href="/">
        ← Judge a first screen
      </Link>
    </main>
  );
}

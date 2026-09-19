"use client";

import { FormEvent, useState } from "react";

type ChoiceAnswer = {
  type: "choice";
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
};

type ScoreAnswer = {
  type: "score";
  score: number;
  confidence: number;
  probabilities: Record<string, number>;
};

type NoulAnswer = { type: "noul"; noul: number };

type JudgeResult = {
  url: string;
  title: string;
  embedding: {
    embeddable: boolean;
    reason: string | null;
  };
  answers: {
    wall: ChoiceAnswer;
    promise_clarity: ScoreAnswer;
    cta_obvious: NoulAnswer;
    pricing_visible: NoulAnswer;
    trust_visible: NoulAnswer;
    verdict: ChoiceAnswer;
  };
  model: string;
  usage?: { input_tokens: number; output_tokens: number };
  latencyMs: number;
};

const samples = [
  { label: "Linear", url: "https://linear.app" },
  { label: "Stripe", url: "https://stripe.com" },
  { label: "GitHub", url: "https://github.com" },
];

const pretty: Record<string, string> = {
  ready: "Ready",
  login: "Login wall",
  sso: "SSO wall",
  captcha: "Captcha",
  paywall: "Paywall",
  empty: "Empty",
  error: "Error",
  loading: "Loading",
  ship: "Ship it",
  fix_copy: "Fix the copy",
  unblock_wall_first: "Unblock the wall",
};

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function Meter({ value, tone = "ink" }: { value: number; tone?: "ink" | "green" | "gold" }) {
  return (
    <div className="meter" aria-hidden="true">
      <span className={`meter-fill ${tone}`} style={{ width: percent(Math.max(0, Math.min(1, value))) }} />
    </div>
  );
}

function ChoiceCard({
  eyebrow,
  answer,
  featured = false,
}: {
  eyebrow: string;
  answer: ChoiceAnswer;
  featured?: boolean;
}) {
  const sorted = Object.entries(answer.probabilities).sort((a, b) => b[1] - a[1]);
  return (
    <article className={`result-card ${featured ? "featured" : ""}`}>
      <p className="card-eyebrow">{eyebrow}</p>
      <div className="answer-line">
        <h3>{pretty[answer.choice] ?? answer.choice.replaceAll("_", " ")}</h3>
        <span className="confidence">{percent(answer.confidence)}</span>
      </div>
      <div className="probabilities">
        {sorted.map(([label, probability]) => (
          <div className="probability" key={label}>
            <div>
              <span>{pretty[label] ?? label.replaceAll("_", " ")}</span>
              <strong>{percent(probability)}</strong>
            </div>
            <Meter value={probability} tone={featured ? "green" : "ink"} />
          </div>
        ))}
      </div>
    </article>
  );
}

function NoulCard({
  eyebrow,
  answer,
  description,
}: {
  eyebrow: string;
  answer: NoulAnswer;
  description: string;
}) {
  const yes = answer.noul;
  return (
    <article className="result-card compact-card">
      <p className="card-eyebrow">{eyebrow}</p>
      <div className="answer-line">
        <h3>{yes >= 0.5 ? "Visible" : "Not visible"}</h3>
        <span className="confidence">{percent(yes)} yes</span>
      </div>
      <p className="card-description">{description}</p>
      <Meter value={yes} tone={yes >= 0.5 ? "green" : "gold"} />
      <div className="meter-labels">
        <span>No</span>
        <span>Yes</span>
      </div>
    </article>
  );
}

function PromiseCard({ answer }: { answer: ScoreAnswer }) {
  const normalized = answer.score / 3;
  const level = Math.max(0, Math.min(3, Math.round(answer.score)));
  const labels = ["Vague hype", "Broad benefit", "Mostly clear", "Concrete offer"];
  return (
    <article className="result-card compact-card">
      <p className="card-eyebrow">Promise</p>
      <div className="answer-line">
        <h3>{labels[level]}</h3>
        <span className="confidence">{answer.score.toFixed(1)} / 3</span>
      </div>
      <p className="card-description">{percent(answer.confidence)} confidence · expected rubric score</p>
      <Meter value={normalized} tone={normalized >= 0.66 ? "green" : "gold"} />
      <div className="score-dots" aria-label={`Promise clarity score ${answer.score.toFixed(1)} out of 3`}>
        {Object.entries(answer.probabilities).map(([score, probability]) => (
          <span key={score} title={`Level ${Number(score) + 1}: ${percent(probability)}`}>
            {Number(score) + 1}
            <small>{percent(probability)}</small>
          </span>
        ))}
      </div>
    </article>
  );
}

function PagePreview({ result }: { result: JudgeResult }) {
  const host = new URL(result.url).hostname;

  return (
    <section className="preview-card" aria-labelledby="preview-title">
      <div className="preview-toolbar">
        <div>
          <p className="section-kicker" id="preview-title">
            First screen preview
          </p>
          <span className="preview-host">{host}</span>
        </div>
        <a href={result.url} target="_blank" rel="noreferrer">
          Open site <span aria-hidden="true">↗</span>
        </a>
      </div>

      {result.embedding.embeddable ? (
        <div className="preview-viewport">
          <iframe
            src={result.url}
            title={`First screen preview of ${result.title || host}`}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            loading="lazy"
          />
        </div>
      ) : (
        <div className="preview-blocked">
          <span className="preview-mark" aria-hidden="true">
            F
          </span>
          <div>
            <strong>{result.title || host}</strong>
            <p>{result.embedding.reason ?? "This site does not allow previews in another page."}</p>
          </div>
          <a href={result.url} target="_blank" rel="noreferrer">
            View first screen
          </a>
        </div>
      )}

      {result.embedding.embeddable ? (
        <p className="preview-note">
          Live, sandboxed preview. If it stays blank, the site blocks embedding.{" "}
          <a href={result.url} target="_blank" rel="noreferrer">
            Open site
          </a>
          .
        </p>
      ) : null}
    </section>
  );
}

export function FirstScreen() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<JudgeResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function judge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!url.trim() || loading) return;
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch("/api/judge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = (await response.json()) as JudgeResult | { error: string };
      if (!response.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "The page could not be judged.");
      }
      setResult(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The page could not be judged.");
    } finally {
      setLoading(false);
    }
  }

  function selectSample(sampleUrl: string) {
    setUrl(sampleUrl);
    setError("");
  }

  return (
    <div className={`experience ${result ? "has-results" : ""}`}>
      <section className="hero">
        <div className="status-pill">
          <span />
          Jev first-screen audit
        </div>
        <h1>
          Your first screen,
          <br />
          <em>judged in a blink.</em>
        </h1>
        <p className="hero-copy">
          Paste any public URL. Jev reads the visible page and returns fast, probability-backed decisions—no
          essays, no fluff.
        </p>

        <form className="judge-form" onSubmit={judge}>
          <label className="sr-only" htmlFor="url">
            Public URL
          </label>
          <div className="url-control">
            <span className="globe" aria-hidden="true">
              ◎
            </span>
            <input
              id="url"
              name="url"
              type="text"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              placeholder="https://your-site.com"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              disabled={loading}
            />
            <button type="submit" disabled={loading || !url.trim()}>
              {loading ? <span className="spinner" aria-hidden="true" /> : null}
              {loading ? "Judging" : "Judge"}
              {!loading ? <span aria-hidden="true">→</span> : null}
            </button>
          </div>
        </form>

        <div className="samples" aria-label="Sample URLs">
          <span>Try</span>
          {samples.map((sample) => (
            <button type="button" key={sample.url} onClick={() => selectSample(sample.url)}>
              {sample.label}
            </button>
          ))}
        </div>
        <div className="message-area" aria-live="polite">
          {loading ? <p>Fetching the page, then asking Jev once…</p> : null}
          {error ? <p className="error-message">{error}</p> : null}
        </div>
      </section>

      {result ? (
        <section className="results" aria-label="Jev judgment">
          <div className="results-heading">
            <div>
              <p className="section-kicker">The judgment</p>
              <h2>{result.title || new URL(result.url).hostname}</h2>
              <a href={result.url} target="_blank" rel="noreferrer">
                {new URL(result.url).hostname} ↗
              </a>
            </div>
            <div className="latency">
              <span>End-to-end</span>
              <strong>{result.latencyMs} ms</strong>
              <small>{result.model}</small>
            </div>
          </div>

          <PagePreview result={result} />

          <div className="results-grid">
            <ChoiceCard eyebrow="Wall" answer={result.answers.wall} />
            <PromiseCard answer={result.answers.promise_clarity} />
            <NoulCard eyebrow="CTA" answer={result.answers.cta_obvious} description="Primary action on the first screen" />
            <NoulCard
              eyebrow="Pricing"
              answer={result.answers.pricing_visible}
              description="Price or pricing language in view"
            />
            <NoulCard
              eyebrow="Trust"
              answer={result.answers.trust_visible}
              description="Proof, logos, guarantees, or metrics"
            />
            <ChoiceCard eyebrow="Verdict" answer={result.answers.verdict} featured />
          </div>
        </section>
      ) : null}
    </div>
  );
}

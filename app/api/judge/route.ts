import { choice, noul, score, TypeSafeClient } from "@typesafe-ai/sdk";
import { NextResponse } from "next/server";
import { fetchPageSummary, normalizePublicUrl, PageFetchError } from "@/lib/fetch-page";
import { incrementJudges } from "@/lib/stats";

export const runtime = "nodejs";

const questions = {
  wall: choice("What state blocks or greets a visitor on this page's first screen?", {
    ready: "The product or public landing content is ready to use or understand.",
    login: "A standard login or sign-up wall blocks the content.",
    sso: "A single sign-on or organization authentication wall blocks the content.",
    captcha: "A CAPTCHA, bot check, or browser verification blocks the content.",
    paywall: "Payment or subscription is required before the content can be used.",
    empty: "The first screen is effectively empty or has no meaningful content.",
    error: "An error or unavailable state is shown.",
    loading: "A loading state prevents judging the actual first screen.",
  }),
  promise_clarity: score(
    "How concrete and understandable is the page's product promise in its first-screen text?",
    [
      "Vague hype with no understandable offer.",
      "A broad category or benefit is visible, but the offer remains unclear.",
      "The audience, problem, or benefit is mostly clear.",
      "A concrete offer makes the product, audience, and outcome immediately clear.",
    ],
  ),
  cta_obvious: noul("Is a primary call to action obvious in the first-screen text?"),
  pricing_visible: noul("Is pricing or a clear price visible in the first-screen text?"),
  trust_visible: noul(
    "Are trust signals such as customer logos, social proof, metrics, guarantees, or security claims visible in the first-screen text?",
  ),
  verdict: choice("What is the best overall verdict for this first screen?", {
    ship: "The first screen is clear and usable enough to ship.",
    fix_copy: "The page is reachable, but its promise, CTA, pricing, or trust copy needs work.",
    unblock_wall_first: "A wall, error, loading state, or empty screen must be resolved before copy can be judged.",
  }),
};

function oneLine(value: string) {
  return JSON.stringify(value.replace(/[\r\n]/g, " "));
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  let attemptedUrl = "";
  let host = "unknown";

  try {
    const body = (await request.json()) as { url?: unknown };
    if (typeof body.url !== "string") {
      throw new PageFetchError("Paste a public URL to judge.", "invalid");
    }

    attemptedUrl = body.url;
    try {
      host = normalizePublicUrl(attemptedUrl).hostname;
    } catch {
      // The fetch helper below returns the user-facing validation error.
    }

    const page = await fetchPageSummary(attemptedUrl);
    attemptedUrl = page.requestedUrl;
    host = page.host;

    const client = new TypeSafeClient({
      apiKey: process.env.TYPESAFE_API_KEY,
      defaultModel: "jev-latest",
      logLevel: "off",
    });
    const response = await client.systemOne(
      {
        model: "jev-latest",
        state: page.state,
        questions,
      },
      { timeout: 10_000 },
    );

    let total: number | "unknown" = "unknown";
    try {
      total = (await incrementJudges()).judges;
    } catch {
      // A stats write must never discard valid Jev answers.
    }

    const ms = Math.round(performance.now() - startedAt);
    console.log(
      `firstscreen_judge url=${oneLine(attemptedUrl)} host=${oneLine(host)} status=ok wall=${response.answers.wall.choice} ms=${ms} total=${total}`,
    );

    return NextResponse.json({
      url: page.finalUrl,
      title: page.state.title,
      embedding: page.embedding,
      answers: response.answers,
      model: response.model,
      usage: response.usage,
      latencyMs: ms,
    });
  } catch (error) {
    const ms = Math.round(performance.now() - startedAt);
    const message =
      error instanceof PageFetchError
        ? error.message
        : error instanceof SyntaxError
          ? "The request was not valid."
          : error instanceof Error && /api key/i.test(error.message)
            ? "FirstScreen is not configured with a TypeSafe API key."
            : "Jev could not judge this page right now. Please try again.";

    console.log(
      `firstscreen_judge url=${oneLine(attemptedUrl || "unknown")} host=${oneLine(host)} status=error ms=${ms}`,
    );
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

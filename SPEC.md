# FirstScreen

Public open-source Jev demo by Raihan Khan (@raihankhan_rk).

Paste a **public URL**. One button. Jev judges the first screen.

## Product
- Landing like DiffJury: centered URL field + **Judge** (no multi-step forms).
- Visually attractive light UI (soft gradients, premium, not purple cliché).
- After Judge: results view with chips/bars for Jev answers + latency/cost if available.
- GitHub link in header: `raihankhan-rk/firstscreen` (Octocat).
- Footer: TypeSafe / System One credit + Built by @raihankhan_rk (X link).
- Sample URL chips so demo works without typing.
- Open source from day one: MIT, clear README, `.env.example` with `TYPESAFE_API_KEY=` only. No secrets in repo.

## Jev questions (single systemOne call)
Given fetched page text/DOM summary (trimmed to token budget locally — no extra LLM):
1. **wall** Choice: ready | login | sso | captcha | paywall | empty | error | loading
2. **promise_clarity** Score: vague hype → concrete offer (4 levels)
3. **cta_obvious** Noul: primary CTA obvious on first screen?
4. **pricing_visible** Noul: pricing visible in first-screen text?
5. **trust_visible** Noul: trust signals present (logos, social proof, guarantees) in text?
6. **verdict** Choice: ship | fix_copy | unblock_wall_first

## Fetch
- Server-side fetch of public http(s) URL only (SSRF-safe: block localhost, private IPs, metadata endpoints).
- Extract title + visible text / simplified HTML text (cheerio or similar). Cap state size for Jev (~28k est tokens).
- Timeout ~10s. Friendly errors for blocked/private/timeout.

## Logging (no persistence)
On every successful or attempted judge, print one structured stdout line Raihan can grep in Railway logs, e.g.:
`firstscreen_judge url=https://example.com host=example.com status=ok|error wall=... ms=...`
No DB, no volume, no analytics SDK, no cookies for tracking.

## Stack
- Next.js App Router + TypeScript
- `@typesafe-ai/sdk` + `jev-latest`
- Railway: Dockerfile standalone or Nixpacks; `PORT`; server-only `TYPESAFE_API_KEY`
- `public/` present for Docker

## Done
- Public repo built on main
- typecheck/lint/build pass
- README: local run + Railway

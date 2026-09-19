# FirstScreen

Paste a public URL. **Jev** judges the first screen: wall, promise clarity, CTA,
pricing, trust, and an overall verdict. The result is a set of fast, typed
decisions with probabilities—not an essay.

Built by [Raihan Khan](https://x.com/raihankhan_rk) and powered by
[TypeSafe System One](https://typesafe.ai).

## How it works

1. The Next.js server validates and fetches a public HTTP(S) page.
2. DNS and every redirect are checked against private, local, reserved, and
   metadata addresses. The validated public IP is pinned for the request.
3. Scripts and non-visible markup are removed and page text is capped locally
   to stay within Jev's state budget.
4. One `systemOne` request asks all six questions in parallel with
   `jev-latest`.

No page data or results are persisted. Every attempt writes one structured
`firstscreen_judge` line to stdout for operational visibility.

## Local development

Requirements: Node.js 20+ and a
[TypeSafe API key](https://typesafe.ai).

```bash
git clone https://github.com/raihankhan-rk/firstscreen.git
cd firstscreen
npm install
cp .env.example .env.local
```

Add your key to `.env.local`:

```dotenv
TYPESAFE_API_KEY=your_key_here
```

Then run:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Quality checks

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

## Deploy to Railway

The included multi-stage `Dockerfile` builds Next.js standalone output and
starts it as a non-root user. Railway supplies `PORT` at runtime.

1. Create a Railway project from this GitHub repository.
2. Add `TYPESAFE_API_KEY` to the service variables.
3. Deploy. Railway detects the root `Dockerfile` automatically.
4. Generate a public domain in the service networking settings.

The app needs no database, volume, analytics service, or other persistent
resource. To inspect judge attempts, search Railway runtime logs for
`firstscreen_judge`.

## Environment variables

| Variable | Required | Scope | Description |
| --- | --- | --- | --- |
| `TYPESAFE_API_KEY` | Yes | Server only | Authenticates the TypeSafe SDK |

Never prefix this variable with `NEXT_PUBLIC_`.

## License

[MIT](LICENSE)

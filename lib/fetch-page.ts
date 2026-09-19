import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Agent, request } from "undici";
import * as cheerio from "cheerio";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 4;
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_STATE_CHARS = 110_000;
const MAX_PREVIEW_CHARS = 750_000;

export class PageFetchError extends Error {
  constructor(
    message: string,
    readonly code: "invalid" | "blocked" | "timeout" | "fetch",
  ) {
    super(message);
    this.name = "PageFetchError";
  }
}

export function normalizePublicUrl(input: string): URL {
  const raw = input.trim();
  if (!raw) throw new PageFetchError("Paste a public URL to judge.", "invalid");

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new PageFetchError("That does not look like a valid URL.", "invalid");
  }

  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new PageFetchError("Only public HTTP and HTTPS URLs are supported.", "invalid");
  }

  url.hash = "";
  return url;
}

function isPublicIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b, c] = octets;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function isPublicIpv6(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0];
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPublicIpv4(mapped[1]);

  return !(
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("ff") ||
    normalized.startsWith("2001:db8:")
  );
}

export function isPublicIp(address: string): boolean {
  const version = isIP(address);
  return version === 4 ? isPublicIpv4(address) : version === 6 ? isPublicIpv6(address) : false;
}

async function resolvePublicAddress(url: URL) {
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname === "metadata.google.internal"
  ) {
    throw new PageFetchError("Private and local addresses cannot be judged.", "blocked");
  }

  if (isIP(hostname)) {
    if (!isPublicIp(hostname)) {
      throw new PageFetchError("Private and local addresses cannot be judged.", "blocked");
    }
    return { address: hostname, family: isIP(hostname) as 4 | 6 };
  }

  let addresses;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new PageFetchError("We could not resolve that host.", "fetch");
  }

  if (!addresses.length || addresses.some(({ address }) => !isPublicIp(address))) {
    throw new PageFetchError("Private and local addresses cannot be judged.", "blocked");
  }
  return addresses[0];
}

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value.join(", ") : (value ?? "");
}

export function getEmbeddingPolicy(headers: {
  "x-frame-options"?: string | string[];
  "content-security-policy"?: string | string[];
}) {
  const frameOptions = headerValue(headers["x-frame-options"]).toUpperCase();
  if (/(^|,)\s*(DENY|SAMEORIGIN)\s*(,|$)/.test(frameOptions)) {
    return { embeddable: false, reason: "This site blocks cross-site framing." };
  }

  const contentSecurityPolicy = headerValue(headers["content-security-policy"]);
  const frameAncestors = contentSecurityPolicy.match(/(?:^|;)\s*frame-ancestors\s+([^;]+)/i)?.[1];
  if (frameAncestors && /(?:^|\s)(?:'none'|'self')(?:\s|$)/i.test(frameAncestors)) {
    return { embeddable: false, reason: "This site restricts who can embed it." };
  }

  return { embeddable: true, reason: null };
}

export function buildStaticPreview(html: string, finalUrl: URL) {
  const $ = cheerio.load(html);

  $("template[id^='B:']").each((_, template) => {
    const boundaryId = $(template).attr("id")?.slice(2);
    if (!boundaryId) return;

    const streamedContent = $(`[id="S:${boundaryId}"]`).first();
    if (!streamedContent.length) return;

    $(template).replaceWith(streamedContent.contents());
    streamedContent.remove();
  });

  $("script, noscript, iframe, object, embed, portal, template").remove();
  $("base, meta[http-equiv], link[rel='modulepreload'], link[rel='preload'][as='script']").remove();
  $("main, h1").parents("[hidden]").removeAttr("hidden");

  $("*").each((_, element) => {
    for (const attribute of Object.keys($(element).attr() ?? {})) {
      if (/^on/i.test(attribute) || attribute === "srcdoc" || attribute === "nonce") {
        $(element).removeAttr(attribute);
      }
    }

    for (const attribute of ["href", "src", "poster", "formaction"]) {
      const value = $(element).attr(attribute);
      if (value && /^\s*(?:javascript|vbscript):/i.test(value)) {
        $(element).removeAttr(attribute);
      }
    }
  });

  $("form").removeAttr("action method target");
  $("a").attr({ target: "_blank", rel: "noopener noreferrer" });
  $("head").prepend(
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src http: https: data:; style-src http: https: 'unsafe-inline'; font-src http: https: data:; media-src http: https:; form-action 'none'; frame-src 'none'">`,
  );
  $("head").prepend(`<base href="${finalUrl.toString()}" target="_blank">`);

  const preview = $.html();
  if (preview.length <= MAX_PREVIEW_CHARS) return preview;
  return `${preview.slice(0, MAX_PREVIEW_CHARS)}</body></html>`;
}

async function fetchHtml(
  initialUrl: URL,
): Promise<{ html: string; finalUrl: URL; embedding: ReturnType<typeof getEmbeddingPolicy> }> {
  let current = initialUrl;

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const resolved = await resolvePublicAddress(current);
    const dispatcher = new Agent({
      connect: {
        lookup: (_hostname, options, callback) => {
          if (options.all) {
            callback(null, [resolved]);
            return;
          }
          callback(null, resolved.address, resolved.family);
        },
      },
    });

    try {
      const response = await request(current, {
        dispatcher,
        headers: {
          accept: "text/html,application/xhtml+xml,text/plain;q=0.8",
          "user-agent": "FirstScreen/1.0 (+https://github.com/raihankhan-rk/firstscreen)",
        },
        headersTimeout: FETCH_TIMEOUT_MS,
        bodyTimeout: FETCH_TIMEOUT_MS,
      });

      if (response.statusCode >= 300 && response.statusCode < 400) {
        const location = response.headers.location;
        await response.body.dump();
        if (!location) throw new PageFetchError("The site returned an invalid redirect.", "fetch");
        if (redirect === MAX_REDIRECTS) {
          throw new PageFetchError("The site redirected too many times.", "fetch");
        }
        current = new URL(Array.isArray(location) ? location[0] : location, current);
        if (!["http:", "https:"].includes(current.protocol)) {
          throw new PageFetchError("The site redirected to an unsupported URL.", "blocked");
        }
        continue;
      }

      if (response.statusCode < 200 || response.statusCode >= 300) {
        await response.body.dump();
        throw new PageFetchError(`The site returned HTTP ${response.statusCode}.`, "fetch");
      }

      const contentType = String(response.headers["content-type"] ?? "").toLowerCase();
      if (contentType && !contentType.includes("html") && !contentType.includes("text/plain")) {
        await response.body.dump();
        throw new PageFetchError("That URL did not return an HTML page.", "fetch");
      }

      const chunks: Buffer[] = [];
      let bytes = 0;
      for await (const chunk of response.body) {
        const buffer = Buffer.from(chunk);
        bytes += buffer.length;
        if (bytes > MAX_RESPONSE_BYTES) {
          throw new PageFetchError("That page is too large to judge safely.", "fetch");
        }
        chunks.push(buffer);
      }
      return {
        html: Buffer.concat(chunks).toString("utf8"),
        finalUrl: current,
        embedding: getEmbeddingPolicy(response.headers),
      };
    } catch (error) {
      if (error instanceof PageFetchError) throw error;
      if (error instanceof Error && /timeout|timed out|abort/i.test(error.message)) {
        throw new PageFetchError("The site took too long to respond.", "timeout");
      }
      throw new PageFetchError("We could not fetch that page.", "fetch");
    } finally {
      await dispatcher.close();
    }
  }

  throw new PageFetchError("The site redirected too many times.", "fetch");
}

export async function fetchPageSummary(input: string) {
  const requestedUrl = normalizePublicUrl(input);
  const { html, finalUrl, embedding } = await fetchHtml(requestedUrl);
  const previewHtml = buildStaticPreview(html, finalUrl);
  const $ = cheerio.load(html);

  $("script, style, noscript, svg, template, iframe, canvas").remove();
  const title = $("title").first().text().replace(/\s+/g, " ").trim();
  const text = $("body")
    .text()
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim()
    .slice(0, MAX_STATE_CHARS);

  if (!text) throw new PageFetchError("We could not find readable text on that page.", "fetch");

  return {
    requestedUrl: requestedUrl.toString(),
    finalUrl: finalUrl.toString(),
    host: finalUrl.hostname,
    embedding,
    previewHtml,
    state: {
      url: finalUrl.toString(),
      title,
      visible_text: text,
    },
  };
}

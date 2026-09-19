import { describe, expect, it } from "vitest";
import { isPublicIp, normalizePublicUrl, PageFetchError } from "./fetch-page";

describe("public URL validation", () => {
  it("adds HTTPS to bare hosts", () => {
    expect(normalizePublicUrl("example.com/path").toString()).toBe("https://example.com/path");
  });

  it("rejects unsupported protocols and credentials", () => {
    expect(() => normalizePublicUrl("file:///etc/passwd")).toThrow(PageFetchError);
    expect(() => normalizePublicUrl("https://user:pass@example.com")).toThrow(PageFetchError);
  });
});

describe("IP safety", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "172.16.1.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "192.0.2.1",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
  ])("blocks %s", (address) => {
    expect(isPublicIp(address)).toBe(false);
  });

  it.each(["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"])("allows %s", (address) => {
    expect(isPublicIp(address)).toBe(true);
  });
});

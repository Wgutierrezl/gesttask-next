import { describe, expect, it } from "vitest";
import { attachmentDisposition } from "@/infrastructure/storage/content-disposition";

describe("attachmentDisposition", () => {
  it.each([
    ["report.pdf", "attachment; filename*=UTF-8''report.pdf"],
    ["résumé (1).txt", "attachment; filename*=UTF-8''r%C3%A9sum%C3%A9%20%281%29.txt"],
    ["日本語.png", "attachment; filename*=UTF-8''%E6%97%A5%E6%9C%AC%E8%AA%9E.png"],
    ["it's *big*.png", "attachment; filename*=UTF-8''it%27s%20%2Abig%2A.png"],
  ])("encodes %j as an RFC 5987 extended value", (name, header) => {
    expect(attachmentDisposition(name)).toBe(header);
  });

  it.each([
    ["a\r\nSet-Cookie: x=1.png", "attachment; filename*=UTF-8''aSet-Cookie%3A%20x%3D1.png"],
    ['say "hi".txt', "attachment; filename*=UTF-8''say%20hi.txt"],
    ["../../etc/passwd", "attachment; filename*=UTF-8''passwd"],
    ["C:\\Users\\me\\scan.pdf", "attachment; filename*=UTF-8''scan.pdf"],
    ["a\u0000b\u007fc.txt", "attachment; filename*=UTF-8''abc.txt"],
  ])("drops control characters, quotes and path parts from %j", (name, header) => {
    const value = attachmentDisposition(name);
    expect(value).toBe(header);
    expect(value).not.toMatch(/[\r\n"]/);
  });

  it.each([[undefined], [""], ["   "], ['""'], ["dir/"]])("falls back to a generic name for %j", (name) => {
    expect(attachmentDisposition(name)).toBe(name === undefined ? "attachment" : "attachment; filename*=UTF-8''download");
  });

  it("caps very long names", () => {
    expect(attachmentDisposition("x".repeat(500))).toBe(`attachment; filename*=UTF-8''${"x".repeat(120)}`);
  });
});

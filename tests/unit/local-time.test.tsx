// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { renderToStaticMarkupWithIntl, renderWithIntl as render } from "@tests/support/render";
import { afterEach, describe, expect, it } from "vitest";
import { formatDate, formatInstant } from "@/components/kanban/format";
import { LocalTime } from "@/components/kanban/local-time";

const ISO = "2026-10-09T10:00:00.000Z";
afterEach(() => {
  cleanup();
  delete process.env.TZ;
});

describe("formatInstant", () => {
  it("writes an instant in UTC with an explicit label when no zone is given", () => {
    expect(formatInstant(ISO, "UTC", "en")).toBe("Oct 9, 2026, 10:00 AM UTC");
  });

  it("writes it in the given zone, labelled with that zone", () => {
    expect(formatInstant(ISO, "America/Bogota", "en")).toBe("Oct 9, 2026, 5:00 AM GMT-5");
  });
});

describe("locale-aware formatting", () => {
  it("keeps the English output as it was", () => {
    expect(formatDate("2026-10-09", "en")).toBe("Oct 9, 2026");
    expect(formatInstant(ISO, "UTC", "en")).toBe("Oct 9, 2026, 10:00 AM UTC");
  });

  it("follows Spanish conventions for dates and instants", () => {
    expect(formatDate("2026-10-09", "es")).toBe("9 oct 2026");
    expect(formatInstant(ISO, "UTC", "es")).toBe("9 oct 2026, 10:00 UTC");
  });
});

describe("LocalTime", () => {
  it("renders Spanish on the server and in the browser from the active locale", async () => {
    process.env.TZ = "America/Bogota";
    expect(renderToStaticMarkupWithIntl(<LocalTime iso={ISO} label="Completada" />, { locale: "es" })).toContain("<time dateTime=\"2026-10-09T10:00:00.000Z\">Completada 9 oct 2026, 10:00 UTC</time>");
    render(<LocalTime iso={ISO} label="Completada" />, { locale: "es" });
    expect((await screen.findByText("Completada 9 oct 2026, 5:00 GMT-5")).tagName).toBe("TIME");
  });

  it("renders UTC on the server, so there is no time zone to guess and no hydration mismatch", () => {
    process.env.TZ = "America/Bogota";
    expect(renderToStaticMarkupWithIntl(<LocalTime iso={ISO} label="Completed" />)).toContain("Completed Oct 9, 2026, 10:00 AM UTC");
  });

  it("switches to the viewer's own time zone in the browser, with its label", async () => {
    process.env.TZ = "America/Bogota";
    render(<LocalTime iso={ISO} label="Completed" />);
    const time = await screen.findByText("Completed Oct 9, 2026, 5:00 AM GMT-5");
    expect(time.tagName).toBe("TIME");
    expect(time.getAttribute("datetime")).toBe(ISO);
  });
});

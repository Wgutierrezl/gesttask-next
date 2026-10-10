// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { formatInstant } from "@/components/kanban/format";
import { LocalTime } from "@/components/kanban/local-time";

const ISO = "2026-10-09T10:00:00.000Z";
afterEach(() => {
  cleanup();
  delete process.env.TZ;
});

describe("formatInstant", () => {
  it("writes an instant in UTC with an explicit label when no zone is given", () => {
    expect(formatInstant(ISO)).toBe("Oct 9, 2026, 10:00 AM UTC");
  });

  it("writes it in the given zone, labelled with that zone", () => {
    expect(formatInstant(ISO, "America/Bogota")).toBe("Oct 9, 2026, 5:00 AM GMT-5");
  });
});

describe("LocalTime", () => {
  it("renders UTC on the server, so there is no time zone to guess and no hydration mismatch", () => {
    process.env.TZ = "America/Bogota";
    expect(renderToString(<LocalTime iso={ISO} label="Completed" />)).toContain("Completed Oct 9, 2026, 10:00 AM UTC");
  });

  it("switches to the viewer's own time zone in the browser, with its label", async () => {
    process.env.TZ = "America/Bogota";
    render(<LocalTime iso={ISO} label="Completed" />);
    const time = await screen.findByText("Completed Oct 9, 2026, 5:00 AM GMT-5");
    expect(time.tagName).toBe("TIME");
    expect(time.getAttribute("datetime")).toBe(ISO);
  });
});

// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const { default: GlobalError } = await import("@/app/global-error");

afterEach(cleanup);

describe("GlobalError", () => {
  it("says it in both languages, shows nothing about the error and retries on demand", async () => {
    const reset = vi.fn();
    // It renders its own <html>, which React warns about when mounted inside the test container.
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<GlobalError error={Object.assign(new Error("secret detail"), { digest: "d" })} reset={reset} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Something went wrong / Algo salió mal");
    expect(screen.queryByText(/secret detail/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Try again / Intentar de nuevo" }));
    expect(reset).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });
});

// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import { renderWithIntl as render } from "@tests/support/render";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const back = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, replace: vi.fn() }),
  useParams: () => ({ boardId: "00000000-0000-4000-8000-000000000001", pipelineId: "00000000-0000-4000-8000-000000000002" }),
}));

const { default: Loading } = await import("@/app/(app)/boards/[boardId]/pipelines/[pipelineId]/@modal/(.)tasks/[taskId]/loading");

const proto = HTMLDialogElement.prototype;
const original = { showModal: proto.showModal, close: proto.close };
beforeAll(() => {
  proto.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute("open", ""); });
  proto.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); });
});
afterAll(() => Object.assign(proto, original));
afterEach(cleanup);

describe("task modal while it loads", () => {
  it("is a dialog that says it is loading, with a busy status for assistive tech", () => {
    render(<Loading />);
    const dialog = screen.getByRole("dialog", { name: "Loading task…" });
    const status = within(dialog).getByRole("status", { name: "Loading task…" });
    expect(status.getAttribute("aria-busy")).toBe("true");
  });

  it("can still be dismissed while loading", async () => {
    Object.defineProperty(History.prototype, "length", { configurable: true, get: () => 2 });
    render(<Loading />);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(back).toHaveBeenCalledTimes(1);
  });
});

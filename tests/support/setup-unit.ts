import { configure } from "@testing-library/react";
import { vi } from "vitest";

// Chokepoints translate failures with the request's locale; outside Next that is English unless a test mocks it itself.
vi.mock("next-intl/server", async () => (await import("./intl-server")).intlServer);

// `findBy*`/`waitFor` give up after 1s by default. A form test types, submits and waits for a server-action round
// trip through React's transition; with v8 coverage instrumenting every module on a loaded machine that first
// round trip can exceed 1s without anything being wrong. Polling returns as soon as the element appears, so a
// generous ceiling costs nothing when the machine is fast and a failing test still fails (just 5s later).
configure({ asyncUtilTimeout: 5000 });

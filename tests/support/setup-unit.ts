import { vi } from "vitest";

// Chokepoints translate failures with the request's locale; outside Next that is English unless a test mocks it itself.
vi.mock("next-intl/server", async () => (await import("./intl-server")).intlServer);

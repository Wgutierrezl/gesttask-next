import { test as setup } from "@playwright/test";
import { AUTH_FILE, tryTheDemo } from "./helpers";

/** One demo sign-in for the whole suite (the demo allows 5 per hour per address); specs reuse the session it saves. */
setup("sign in as a demo guest", async ({ page }) => {
  await tryTheDemo(page);
  await page.context().storageState({ path: AUTH_FILE });
});

import { expect, test } from "@playwright/test";

// REQ-THM-02 / REQ-I18N-04: the very first HTML response carries the theme and the language, so no script has to set them.
test.use({ storageState: { cookies: [], origins: [] } });

test("the first HTML response carries data-theme=dark and lang=es from the cookies", async ({ request }) => {
  const response = await request.get("/login", { headers: { cookie: "theme=dark; locale=es" } });
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toMatch(/<html[^>]*\blang="es"/);
  expect(html).toMatch(/<html[^>]*\bdata-theme="dark"/);
  const plain = await (await request.get("/login")).text();
  expect(plain).toMatch(/<html[^>]*\bdata-theme="system"/);
});

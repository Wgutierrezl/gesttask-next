import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// Adds `.openapi("Name")` to schemas created after this line, so a response schema becomes one shared component.
// Import `z` from here in files that declare response schemas.
extendZodWithOpenApi(z);

export { z };

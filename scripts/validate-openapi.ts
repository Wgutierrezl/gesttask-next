import { validate } from "@scalar/openapi-parser";
import { buildOpenApiDocument } from "../src/openapi/registry";
import { OPERATIONS } from "../src/openapi/operations";

// CI gate (REQ-API-02): the generated document must be valid OpenAPI 3.1 and must document every declared operation.
const document = JSON.parse(JSON.stringify(buildOpenApiDocument())) as { paths: Record<string, Record<string, unknown>> };
const problems: string[] = [];

const result = await validate(document);
if (!result.valid) for (const error of result.errors ?? []) problems.push(`invalid document: ${error.message}`);

for (const operation of OPERATIONS) {
  if (!document.paths[operation.path]?.[operation.method]) problems.push(`operation ${operation.id} is not in the document`);
}

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  process.exit(1);
}
console.log(`OpenAPI document is valid: ${OPERATIONS.length} operations on ${Object.keys(document.paths).length} paths.`);

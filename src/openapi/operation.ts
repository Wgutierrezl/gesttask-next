import type { z } from "zod";

export type Method = "get" | "post" | "patch" | "delete";

export type Tag = "Boards" | "Members" | "Pipelines" | "Stages" | "Tasks" | "Comments" | "Attachments" | "Dashboard";

/**
 * What a route answers on success. Lists are always wrapped as `{ items, nextCursor }` (REQ-API-04); `paginated` lists
 * take `limit` and `cursor`, the others return everything the use case yields and `nextCursor` is null.
 */
export type OperationResponse =
  | { kind: "none" }
  | { kind: "item"; status: 200 | 201; schema: z.ZodType }
  | { kind: "list"; item: z.ZodType; paginated: boolean };

/**
 * One REST operation, declared once: the route handler runs it and the OpenAPI document is generated from it, so what is
 * documented is what is served (REQ-API-02). `id` is the OpenAPI operationId AND the name of the use case it calls.
 * The input a use case receives is `{ ...query, ...body, ...pathParams }` (path last: a body can never aim at another id).
 */
export interface Operation {
  id: string;
  method: Method;
  /** OpenAPI path template relative to `/api/v1`, e.g. `/boards/{boardId}`. */
  path: string;
  tag: Tag;
  summary: string;
  params?: z.ZodObject;
  query?: z.ZodObject;
  body?: z.ZodObject;
  response: OperationResponse;
  /** Refusals other than "not authenticated" read as 404, as on the web route (the resource is a credential to a file). */
  hidesExistence?: true;
}

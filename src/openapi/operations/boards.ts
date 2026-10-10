import { boardIdSchema, createBoardSchema, updateBoardSchema } from "@/application/schemas/board";
import type { Operation } from "../operation";
import { pageQuery } from "../page-query";
import { boardResponse, boardWithRoleResponse } from "../responses";

export const boardOperations: Operation[] = [
  {
    id: "listMyBoards", method: "get", path: "/boards", tag: "Boards", summary: "List the boards you belong to",
    query: pageQuery, response: { kind: "list", item: boardResponse, paginated: true },
  },
  {
    id: "createBoard", method: "post", path: "/boards", tag: "Boards", summary: "Create a board (you become its owner)",
    body: createBoardSchema, response: { kind: "item", status: 201, schema: boardResponse },
  },
  {
    id: "getBoard", method: "get", path: "/boards/{boardId}", tag: "Boards", summary: "Get a board and your role in it",
    params: boardIdSchema, response: { kind: "item", status: 200, schema: boardWithRoleResponse },
  },
  {
    id: "updateBoard", method: "patch", path: "/boards/{boardId}", tag: "Boards", summary: "Rename, describe or archive a board (owner)",
    params: boardIdSchema, body: updateBoardSchema.omit({ boardId: true }), response: { kind: "item", status: 200, schema: boardResponse },
  },
  {
    id: "deleteBoard", method: "delete", path: "/boards/{boardId}", tag: "Boards", summary: "Delete a board with everything in it (owner)",
    params: boardIdSchema, response: { kind: "none" },
  },
];

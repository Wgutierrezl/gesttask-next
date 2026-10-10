import { changeMemberRoleSchema, addMemberByEmailSchema, memberTargetSchema } from "@/application/schemas/member";
import { boardIdSchema } from "@/application/schemas/board";
import type { Operation } from "../operation";
import { pageQuery } from "../page-query";
import { memberProfileResponse, memberResponse } from "../responses";

export const memberOperations: Operation[] = [
  {
    id: "listMemberProfiles", method: "get", path: "/boards/{boardId}/members", tag: "Members", summary: "List the members of a board",
    params: boardIdSchema, query: pageQuery, response: { kind: "list", item: memberProfileResponse, paginated: true },
  },
  {
    id: "addMemberByEmail", method: "post", path: "/boards/{boardId}/members", tag: "Members", summary: "Add a registered user to a board by email (owner)",
    params: boardIdSchema, body: addMemberByEmailSchema.omit({ boardId: true }), response: { kind: "item", status: 201, schema: memberResponse },
  },
  {
    id: "changeMemberRole", method: "patch", path: "/boards/{boardId}/members/{userId}", tag: "Members", summary: "Change a member's role (owner)",
    params: memberTargetSchema, body: changeMemberRoleSchema.pick({ role: true }), response: { kind: "item", status: 200, schema: memberResponse },
  },
  {
    id: "removeMember", method: "delete", path: "/boards/{boardId}/members/{userId}", tag: "Members", summary: "Remove a member from a board (owner)",
    params: memberTargetSchema, response: { kind: "none" },
  },
  {
    id: "listMyMemberships", method: "get", path: "/me/memberships", tag: "Members", summary: "List your own memberships",
    response: { kind: "list", item: memberResponse, paginated: false },
  },
];

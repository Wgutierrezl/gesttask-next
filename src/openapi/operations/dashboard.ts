import { boardIdSchema } from "@/application/schemas/board";
import type { Operation } from "../operation";
import { boardDashboardResponse, userDashboardResponse } from "../responses";

export const dashboardOperations: Operation[] = [
  {
    id: "getUserDashboard", method: "get", path: "/dashboard", tag: "Dashboard",
    summary: "Your numbers: the boards you are on and the tasks assigned to you, by priority, status and overdue (zeros when empty)",
    response: { kind: "item", status: 200, schema: userDashboardResponse },
  },
  {
    id: "getBoardDashboard", method: "get", path: "/boards/{boardId}/dashboard", tag: "Dashboard",
    summary: "Counts of one board: members, and tasks by pipeline, stage (empty stages included), priority, status and overdue",
    params: boardIdSchema, response: { kind: "item", status: 200, schema: boardDashboardResponse },
  },
];

# ADR 0006: Authorization is one policy, applied inside the use case, and strangers get 404

Status: accepted (slices 1 and 3).

## Context

v1 had four IDOR bugs (`getTaskById`, `getAllTaskByPipeId`, `getAllMemberByBoardId`, `getAllBoardsMembersByUserId`): any
signed-in user could read another board's data by id, because authorization lived in some routes and not in others.

## Decision

- `domain/policy/board-policy.ts` is a table: which role may perform which action (`board:view`, `task:write`,
  `comment:moderate`, ...). It is the only place roles are interpreted.
- `application/authorize.ts` resolves the board OF THE RESOURCE (a task or comment knows its `boardId`), loads the
  caller's membership and applies the table BEFORE any data is returned. A caller who is not a member gets
  `NotFoundError`, indistinguishable from a missing id; a member whose role is too weak gets `ForbiddenError`.
- Use cases never accept a user id to act as: the actor comes from the session (`SessionPort`), and a use case that
  reads "my" data takes no id at all (`getUserDashboard`, `listMyBoards`).
- The demo visitor is an anonymous user who OWNS a private copy of the demo board; the `guest` role (read and comment on
  text only) is what an invited viewer gets.

## Consequences

- IDOR is prevented by construction and pinned by tests: the isolation matrix (`tests/unit/isolation`) runs EVERY use case
  as a stranger (expect 404, nothing changed) and as an under-privileged member (expect 403), and fails if a use case is
  registered without being in the matrix. The REST suites repeat it per endpoint, and the dashboards are in it.
- A malformed id answers like a missing one (REQ-ISO-08), so ids cannot be probed.
- The price: a wrong role costs one membership query per request, and every new action needs a row in the table.

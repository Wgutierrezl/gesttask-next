# ADR 0005: Member invitations without consent in v1

## Status

Accepted for v1 (portfolio scope).

## Context

A board owner adds a person by email and that person becomes a member immediately. There is no invitation to
accept: the invitee only notices the board the next time they open their list. This has two costs: an owner
can attach any registered account to a board without its consent (unwanted boards, visible name), and the
lookup behind it can be used to learn which emails are registered (ADR 0004, invite-by-email enumeration).

## Decision

Keep the immediate add for v1. The product is a portfolio project with no email delivery, and a proper
invite/accept flow needs a pending-invitation state, email sending and expiry, all out of scope.

Mitigations already in place:

- Only owners of real accounts can invite; demo sessions are refused.
- The owner picks the role (member or read-only guest). Members cannot leave on their own yet: only an owner
  can remove them, which is part of the future work below.
- Member emails are visible to owners only; other members see names.
- Lookups are rate limited per account (30/h) and per client (60/h).

## Future work

Invite/accept flow: `board_invitations` with a token, expiry and a pending state, a notification email, and
"leave board" for members. Verified emails would also let the enumeration replies be made uniform.

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PastTheEnd } from "./pager";
import { ROLE_LABEL, type RoleName } from "./role-label";

export interface MemberView {
  userId: string;
  role: RoleName;
  name: string;
  email: string | null;
}

/** Read-only member list; managing members lives in the board settings. */
export function MembersPanel({ members, pastTheEndHref }: { members: MemberView[]; pastTheEndHref?: string }) {
  return (
    <section aria-label="Members">
      <h2 className="mb-3 text-lg font-semibold text-slate-900">Members</h2>
      {members.length === 0 && pastTheEndHref ? <PastTheEnd what="members" href={pastTheEndHref} /> : null}
      <Card>
        <ul className="divide-y divide-slate-100">
          {members.map((member) => (
            <li key={member.userId} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="flex min-w-0 items-center gap-3">
                <Avatar name={member.name} />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-900">{member.name}</span>
                  {member.email ? <span className="block truncate text-slate-600">{member.email}</span> : null}
                </span>
              </span>
              <Badge>{ROLE_LABEL[member.role]}</Badge>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

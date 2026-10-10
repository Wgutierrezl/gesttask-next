import { ROLE_LABEL, type RoleName } from "./role-label";

export interface MemberView {
  userId: string;
  role: RoleName;
  name: string;
  email: string | null;
}

/** Read-only member list; managing members lives in the board settings. */
export function MembersPanel({ members }: { members: MemberView[] }) {
  return (
    <section aria-label="Members">
      <h2 className="mb-3 text-lg font-medium">Members</h2>
      <ul className="divide-y divide-gray-100 rounded border border-gray-200">
        {members.map((member) => (
          <li key={member.userId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <span>
              <span className="font-medium">{member.name}</span>
              {member.email ? <span className="ml-2 text-gray-600">{member.email}</span> : null}
            </span>
            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs">{ROLE_LABEL[member.role]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

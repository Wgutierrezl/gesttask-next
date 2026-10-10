import { ChangeRoleForm } from "./change-role-form";
import type { MemberView } from "./members-panel";
import { RemoveMemberForm } from "./remove-member-form";

/** One member in the settings: who they are, with the owner's controls to change their role or remove them. */
export function MemberRow({ boardId, member }: { boardId: string; member: MemberView }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 text-sm">
      <span>
        <span className="font-medium">{member.name}</span>
        {member.email ? <span className="ml-2 text-gray-600">{member.email}</span> : null}
      </span>
      <span className="flex flex-wrap items-start gap-3">
        <ChangeRoleForm boardId={boardId} member={member} />
        <RemoveMemberForm boardId={boardId} userId={member.userId} />
      </span>
    </li>
  );
}

import { Crown, Eye, Shield, User, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { AddMemberForm } from "./add-member-form";
import { ChangeRoleForm } from "./change-role-form";
import type { MemberView } from "./member-view";
import { RemoveMemberForm } from "./remove-member-form";
import { ROLES, type RoleName } from "./role-label";

const ROLE_ICONS = { owner: Crown, member: User, guest: Eye } as const;
const OWNER_BADGE = "inline-flex items-center gap-1.5 rounded-lg border border-warning-edge bg-warning-soft px-3 py-1 text-xs text-warning-fg";
const ROLE_BADGE = "rounded-lg border border-border bg-surface px-3 py-1 text-xs text-fg-strong";

interface MembersDialogBodyProps {
  boardId: string;
  members: MemberView[];
  currentUserId: string;
  canManage: boolean;
  /** The list was cut at the load cap: say so, the settings page pages through everyone. */
  truncated?: boolean;
}

/** What the members dialog holds, like v1's: the add panel (owners), the current members and what each role can do. */
export function MembersDialogBody({ boardId, members, currentUserId, canManage, truncated = false }: MembersDialogBodyProps) {
  const t = useTranslations("board.dialog");
  return (
    <>
      {canManage ? (
        <section aria-labelledby="add-member-heading" className="rounded-xl border border-border-hover bg-brand-soft p-4">
          <h3 id="add-member-heading" className="mb-3 flex items-center gap-2 text-fg-strong">
            <UserPlus aria-hidden="true" className="size-5 text-icon-fg" />
            {t("addTitle")}
          </h3>
          <AddMemberForm boardId={boardId} inline />
        </section>
      ) : null}
      <section aria-labelledby="current-members-heading">
        <h3 id="current-members-heading" className="mb-3 flex items-center gap-2 text-fg-strong">
          <Shield aria-hidden="true" className="size-5 text-fg-muted" />
          {t("current", { count: members.length })}
        </h3>
        <ul className="flex flex-col gap-3">
          {members.map((member) => (
            <MemberCard key={member.userId} boardId={boardId} member={member} isSelf={member.userId === currentUserId} canManage={canManage} />
          ))}
        </ul>
        {truncated ? <p className="mt-3 text-xs text-fg-muted">{t("truncated", { count: members.length })}</p> : null}
      </section>
      <section aria-labelledby="permissions-heading" className="rounded-xl border border-border bg-surface-hover p-4">
        <h3 id="permissions-heading" className="mb-3 text-sm text-fg">{t("permissions")}</h3>
        <ul className="flex flex-col gap-2 text-xs text-fg-muted">
          {ROLES.map((role) => (
            <li key={role}>
              <Permission role={role}>{t(`permission.${role}`)}</Permission>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function Permission({ role, children }: { role: RoleName; children: ReactNode }) {
  const roles = useTranslations("common.roles");
  const Icon = ROLE_ICONS[role];
  return (
    <p className="flex items-start gap-2">
      <Icon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-fg-subtle" />
      <span><strong className="font-medium text-fg-strong">{roles(role)}:</strong> {children}</span>
    </p>
  );
}

function MemberCard({ boardId, member, isSelf, canManage }: { boardId: string; member: MemberView; isSelf: boolean; canManage: boolean }) {
  const t = useTranslations();
  const controls = canManage && !isSelf && member.role !== "owner";
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-hover p-4">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={member.name} />
        <div className="min-w-0">
          <p className="truncate text-fg">
            {member.name}
            {isSelf ? <span className="ml-1.5 text-xs text-fg-subtle">{t("board.dialog.you")}</span> : null}
          </p>
          {member.email ? <p className="truncate text-sm text-fg-muted">{member.email}</p> : null}
        </div>
      </div>
      {controls ? (
        <div className="flex flex-wrap items-start gap-3">
          <ChangeRoleForm boardId={boardId} member={member} />
          <RemoveMemberForm boardId={boardId} userId={member.userId} name={member.name} compact />
        </div>
      ) : member.role === "owner" ? (
        <span className={OWNER_BADGE}>
          <Crown aria-hidden="true" className="size-3.5" />
          {t("common.roles.owner")}
        </span>
      ) : (
        <span className={ROLE_BADGE}>{t(`common.roles.${member.role}`)}</span>
      )}
    </li>
  );
}

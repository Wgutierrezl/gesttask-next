"use client";

import { UserCog, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

/**
 * The header's members control like v1's: a pill that opens the member list in a modal. Owners get "Manage members",
 * everyone else a plain "Members" view. The server renders `children`; this only owns the open state and the footer.
 */
export function MembersDialog({ boardName, canManage, children }: { boardName: string; canManage: boolean; children: ReactNode }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const label = canManage ? t("board.dialog.manage") : t("board.members");
  const Icon = canManage ? UserCog : Users;
  return (
    <>
      <Button variant="secondary" size="sm" className="rounded-xl" onClick={() => setOpen(true)}>
        <Icon aria-hidden="true" className="size-4" />
        {label}
      </Button>
      <Dialog title={label} subtitle={boardName} size="lg" open={open} onClose={close}>
        {children}
        <div className="sticky -bottom-6 -mx-6 -mb-6 flex justify-end border-t border-border bg-elevated px-6 py-4">
          <Button variant="solid" onClick={close} className="rounded-xl">{t("common.close")}</Button>
        </div>
      </Dialog>
    </>
  );
}

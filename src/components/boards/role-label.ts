/** How a board role reads in the UI; the stored value `guest` is shown as "Viewer". */
export const ROLE_LABEL = { owner: "Owner", member: "Member", guest: "Viewer" } as const;
export type RoleName = keyof typeof ROLE_LABEL;

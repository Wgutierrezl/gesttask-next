/** Board roles in the order the UI lists them; the stored value `guest` is shown as "Viewer" (see `common.roles`). */
export const ROLES = ["owner", "member", "guest"] as const;
export type RoleName = (typeof ROLES)[number];

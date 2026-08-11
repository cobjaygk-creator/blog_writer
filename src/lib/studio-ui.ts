/**
 * Studio UI kill-switch (post-login tool shell + editor chrome).
 * - Default: enabled
 * - Rollback: NEXT_PUBLIC_STUDIO_UI=0
 */
export function isStudioUiEnabled(): boolean {
  const v = process.env.NEXT_PUBLIC_STUDIO_UI?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off") return false;
  return true;
}

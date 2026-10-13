import { getViewer } from "@/lib/dal";
import { HeaderAccountMenu, HeaderAgencySwitcher, SidebarUserCard } from "@/components/dashboard/shell-identity-client";

/**
 * Shell identity islands. Each resolves the viewer through the per-request
 * memoized DAL, so the sidebar card, the agency switcher and the account menu
 * share a single `/api/users/me` call — and the static shell (nav, search,
 * notifications, page skeletons) paints without waiting for them.
 */
export async function ShellSidebarIdentity() {
  const user = await getViewer();
  return <SidebarUserCard user={user} />;
}

export async function ShellHeaderLeading() {
  const user = await getViewer();
  return <HeaderAgencySwitcher user={user} />;
}

export async function ShellHeaderMenu() {
  const user = await getViewer();
  return <HeaderAccountMenu user={user} />;
}

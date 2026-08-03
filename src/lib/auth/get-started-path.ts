/** Quick role chooser shown to a signed-in user we can't yet route to a portal. */
export const GET_STARTED_PATH = "/auth/get-started";

export const GET_STARTED_ADD_MODE = "add";

/** Signed-in users with existing portals use this to add resident, property, or vendor roles. */
export function getStartedAddPortalPath(): string {
  return `${GET_STARTED_PATH}?mode=${GET_STARTED_ADD_MODE}`;
}

export function isGetStartedAddMode(
  searchParams: Pick<URLSearchParams, "get"> | string | null | undefined,
): boolean {
  if (!searchParams) return false;
  if (typeof searchParams === "string") {
    return new URLSearchParams(searchParams).get("mode") === GET_STARTED_ADD_MODE;
  }
  return searchParams.get("mode") === GET_STARTED_ADD_MODE;
}

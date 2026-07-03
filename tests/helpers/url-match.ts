/** Escape all regex metacharacters — a partial escape (e.g. only "/") can leave
 * other characters (".", "\\", etc.) able to alter the match. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Build a RegExp that matches a literal URL path, for use with `expect(page).toHaveURL(...)`. */
export function pathToUrlRegExp(path: string): RegExp {
  return new RegExp(escapeRegExp(path));
}

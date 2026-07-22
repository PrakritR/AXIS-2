/**
 * Public marketing contact — single source for footer, contact, support, legal.
 * Ops inbox still lives on the production axis-seattle-housing.com domain
 * (no PropLane mail domain in the product yet). Brand copy is PropLane;
 * the address is the real deliverable mailbox.
 */
export const PUBLIC_SUPPORT_EMAIL = "info@axis-seattle-housing.com";
export const PUBLIC_SUPPORT_PHONE_DISPLAY = "(510) 309-8345";
export const PUBLIC_SUPPORT_PHONE_TEL = "+15103098345";
export const PUBLIC_SUPPORT_ADDRESS_LINE = "5259 Brooklyn Ave NE, Seattle, WA 98105";
export const PUBLIC_SUPPORT_ADDRESS_MAP_QUERY = "5259+Brooklyn+Ave+NE%2C+98105";

export const MANAGER_GET_STARTED_HREF =
  "/auth/create-account?mode=create&role=manager";
export const BOOK_DEMO_HREF = "/contact?tab=schedule";

/**
 * Public social profiles, rendered as the footer icon row.
 *
 * The handles below are the intended PropLane profiles; each one is
 * env-overridable (`NEXT_PUBLIC_SOCIAL_*`) so a profile can be repointed
 * without a code change, and a network we do not hold yet can be blanked out
 * — an empty value drops that icon from the footer entirely rather than
 * shipping a link that 404s.
 */
export type PublicSocialId = "instagram" | "x" | "linkedin" | "facebook";

export type PublicSocialLink = {
  id: PublicSocialId;
  /** Accessible name — also the link title attribute. */
  label: string;
  href: string;
};

const SOCIAL_DEFAULTS: Record<PublicSocialId, { label: string; href: string }> = {
  instagram: { label: "PropLane on Instagram", href: "https://www.instagram.com/proplaneapp" },
  x: { label: "PropLane on X", href: "https://x.com/proplaneapp" },
  linkedin: { label: "PropLane on LinkedIn", href: "https://www.linkedin.com/company/proplaneapp" },
  facebook: { label: "PropLane on Facebook", href: "https://www.facebook.com/proplaneapp" },
};

const SOCIAL_ENV: Record<PublicSocialId, string | undefined> = {
  // Read as literals so Next can inline them into the client bundle.
  instagram: process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM,
  x: process.env.NEXT_PUBLIC_SOCIAL_X,
  linkedin: process.env.NEXT_PUBLIC_SOCIAL_LINKEDIN,
  facebook: process.env.NEXT_PUBLIC_SOCIAL_FACEBOOK,
};

export const PUBLIC_SOCIAL_LINKS: PublicSocialLink[] = (
  Object.keys(SOCIAL_DEFAULTS) as PublicSocialId[]
)
  .map((id) => {
    const override = SOCIAL_ENV[id]?.trim();
    return {
      id,
      label: SOCIAL_DEFAULTS[id].label,
      href: override === undefined ? SOCIAL_DEFAULTS[id].href : override,
    };
  })
  .filter((link) => link.href.length > 0);

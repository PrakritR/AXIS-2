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
export const BOOK_DEMO_HREF = "/book-a-demo";

/**
 * Public social profiles, rendered as the footer icon row.
 *
 * Every default below is deliberately EMPTY: we do not hold a confirmed handle
 * on any of these networks yet, and a public footer link to an unclaimed handle
 * either 404s or hands a squatter our brand. An empty href drops that icon from
 * the footer entirely, so the row only ever renders profiles someone has
 * confirmed by setting `NEXT_PUBLIC_SOCIAL_*` in the environment. Do not
 * hardcode a URL here to "fill in" a network — supply it via env once the
 * account actually exists.
 */
export type PublicSocialId = "instagram" | "x" | "linkedin" | "facebook";

export type PublicSocialLink = {
  id: PublicSocialId;
  /** Accessible name — also the link title attribute. */
  label: string;
  href: string;
};

const SOCIAL_DEFAULTS: Record<PublicSocialId, { label: string; href: string }> = {
  instagram: { label: "PropLane on Instagram", href: "" },
  x: { label: "PropLane on X", href: "" },
  linkedin: { label: "PropLane on LinkedIn", href: "" },
  facebook: { label: "PropLane on Facebook", href: "" },
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

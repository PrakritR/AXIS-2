import Link from "next/link";

type PublicPageAuthFooterProps = {
  getStartedHref: string;
  signInHref: string;
  getStartedLabel?: string;
  getStartedDataAttr?: string;
  signInDataAttr?: string;
};

/** Shared bottom CTA — full-width Get started + Sign in link (resident browse, manager pricing). */
export function PublicPageAuthFooter({
  getStartedHref,
  signInHref,
  getStartedLabel = "Get started",
  getStartedDataAttr = "public-get-started",
  signInDataAttr = "public-sign-in",
}: PublicPageAuthFooterProps) {
  return (
    <div className="mx-auto mt-12 max-w-md space-y-3 pb-6 text-center sm:mt-14 sm:pb-8">
      <Link
        href={getStartedHref}
        data-attr={getStartedDataAttr}
        className="btn-cobalt flex min-h-[52px] w-full items-center justify-center rounded-full py-3 text-sm font-semibold transition active:scale-[0.98]"
      >
        {getStartedLabel}
      </Link>
      <p className="text-sm text-muted">
        Already have an account?{" "}
        <Link href={signInHref} data-attr={signInDataAttr} className="font-semibold text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

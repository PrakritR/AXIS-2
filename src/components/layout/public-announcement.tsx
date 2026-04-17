import Link from "next/link";
import { Button } from "@/components/ui/button";

export function PublicAnnouncement() {
  return (
    <div className="bg-announce text-white">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-2 text-center text-xs font-semibold tracking-wide sm:flex-row sm:text-left">
        <p>
          SIGN UP NOW. NO APPLICATION FEE FOR A LIMITED TIME.
        </p>
        <Link href="/rent/apply">
          <Button type="button" className="px-3 py-1 text-xs" variant="primary">
            Apply now
          </Button>
        </Link>
      </div>
    </div>
  );
}

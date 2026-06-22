import { redirect } from "next/navigation";

/** @deprecated Owner accounts were merged into manager + co-manager links. */
export default async function CreateOwnerPage({
  searchParams,
}: {
  searchParams: Promise<{ slot?: string }>;
}) {
  const { slot } = await searchParams;
  const slotQuery = slot ? `&slot=${encodeURIComponent(slot)}` : "";
  redirect(`/auth/create-account?role=manager${slotQuery}`);
}

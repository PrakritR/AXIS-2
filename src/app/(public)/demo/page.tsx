import type { Metadata } from "next";
import { DemoPortalExperience } from "@/components/demo/demo-portal-experience";

export const metadata: Metadata = {
  title: "Live demo · PropLane",
  description:
    "Explore an interactive, sandboxed PropLane property portal — manager, resident, and vendor views with a live AI assistant. No login required.",
};

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-background pb-16 text-foreground">
      <DemoPortalExperience />
    </div>
  );
}

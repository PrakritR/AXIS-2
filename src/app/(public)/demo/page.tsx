import type { Metadata } from "next";
import { DemoPortalExperience } from "@/components/demo/demo-portal-experience";

export const metadata: Metadata = {
  title: "Live demo · Axis",
  description:
    "Explore an interactive, sandboxed Axis property portal — manager and resident views with realistic data and a live AI assistant. No login required.",
};

export default function DemoPage() {
  return (
    <div className="pb-16">
      <DemoPortalExperience />
    </div>
  );
}

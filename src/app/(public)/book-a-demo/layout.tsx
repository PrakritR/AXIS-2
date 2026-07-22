import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Book a demo · PropLane",
  description: "Schedule a live walkthrough of PropLane with our team.",
};

export default function BookADemoLayout({ children }: { children: ReactNode }) {
  return children;
}

"use client";

import {
  BarChart3,
  Building2,
  Calendar,
  Circle,
  ClipboardList,
  CreditCard,
  Folder,
  Inbox,
  LayoutDashboard,
  Link2,
  LogIn,
  Megaphone,
  MessageSquare,
  ScrollText,
  Settings,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/** Section id → community-standard lucide glyph. One source for every portal nav icon. */
const SECTION_ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  properties: Building2,
  residents: Users,
  "axis-users": Users,
  leases: ScrollText,
  lease: ScrollText,
  calendar: Calendar,
  events: Calendar,
  applications: ClipboardList,
  payments: CreditCard,
  documents: Folder,
  financials: BarChart3,
  services: Wrench,
  inbox: Inbox,
  "bugs-feedback": MessageSquare,
  profile: Settings,
  settings: Settings,
  plan: CreditCard,
  relationships: Link2,
  "move-in": LogIn,
  promotion: Megaphone,
};

export function PortalNavIcon({ section, className }: { section: string; className?: string }) {
  const Icon = SECTION_ICONS[section] ?? Circle;
  return <Icon className={className ?? "h-[18px] w-[18px] shrink-0"} strokeWidth={2} aria-hidden />;
}

/** @deprecated Use PortalNavIcon */
export const AdminPortalNavIcon = PortalNavIcon;

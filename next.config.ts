import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Supabase Storage (all hosted projects)
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "*.supabase.in" },
      // Unsplash fallback photos on listing cards
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
  async redirects() {
    return [
      { source: "/admin/applications", destination: "/admin/dashboard", permanent: false },
      { source: "/admin/applications/:path*", destination: "/admin/dashboard", permanent: false },
      { source: "/admin/work-orders", destination: "/admin/dashboard", permanent: false },
      { source: "/admin/work-orders/:path*", destination: "/admin/dashboard", permanent: false },
      { source: "/admin/payments", destination: "/admin/dashboard", permanent: false },
      { source: "/admin/payments/:path*", destination: "/admin/dashboard", permanent: false },
      { source: "/admin/announcements", destination: "/admin/dashboard", permanent: false },
      { source: "/admin/announcements/:path*", destination: "/admin/dashboard", permanent: false },
      { source: "/admin/calendar", destination: "/admin/events", permanent: false },
      { source: "/admin/calendar/week", destination: "/admin/events", permanent: false },
      { source: "/admin/calendar/availability", destination: "/admin/events", permanent: false },
      { source: "/admin/events/events", destination: "/admin/events", permanent: false },
      { source: "/admin/events/availability", destination: "/admin/events", permanent: false },
      { source: "/admin/leasing", destination: "/admin/leases", permanent: false },
      { source: "/admin/leasing/:path*", destination: "/admin/leases", permanent: false },
      { source: "/admin/leases/manager-review", destination: "/admin/leases", permanent: false },
      { source: "/admin/leases/admin-review", destination: "/admin/leases", permanent: false },
      { source: "/admin/leases/with-resident", destination: "/admin/leases", permanent: false },
      { source: "/admin/leases/signed", destination: "/admin/leases", permanent: false },
      { source: "/resident/home", destination: "/resident/properties", permanent: false },
      { source: "/resident/home/:path*", destination: "/resident/properties", permanent: false },
      { source: "/resident/leases", destination: "/resident/documents/lease", permanent: false },
      { source: "/resident/leases/:path*", destination: "/resident/documents/lease", permanent: false },
      { source: "/resident/lease", destination: "/resident/documents/lease", permanent: false },
      { source: "/resident/lease/:path*", destination: "/resident/documents/lease", permanent: false },
      { source: "/resident/announcements", destination: "/resident/dashboard", permanent: false },
      { source: "/resident/announcements/:path*", destination: "/resident/dashboard", permanent: false },
      { source: "/resident/settings", destination: "/resident/profile", permanent: false },
      { source: "/resident/settings/:path*", destination: "/resident/profile", permanent: false },
      { source: "/resident/support", destination: "/resident/dashboard", permanent: false },
      { source: "/resident/support/:path*", destination: "/resident/dashboard", permanent: false },
      { source: "/portal/services/work-done", destination: "/portal/financials/expenses", permanent: false },
      { source: "/portal/services/work-done/:path*", destination: "/portal/financials/expenses", permanent: false },
      { source: "/portal/work-orders", destination: "/portal/services/work-orders", permanent: false },
      { source: "/portal/work-orders/:path*", destination: "/portal/services/work-orders", permanent: false },
    ];
  },
};

export default nextConfig;

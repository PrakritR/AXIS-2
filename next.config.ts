import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
      { source: "/admin/leasing", destination: "/admin/leases", permanent: false },
      { source: "/admin/leasing/:path*", destination: "/admin/leases", permanent: false },
      { source: "/admin/leases/manager-review", destination: "/admin/leases", permanent: false },
      { source: "/admin/leases/admin-review", destination: "/admin/leases", permanent: false },
      { source: "/admin/leases/with-resident", destination: "/admin/leases", permanent: false },
      { source: "/admin/leases/signed", destination: "/admin/leases", permanent: false },
      { source: "/resident/home", destination: "/resident/properties", permanent: false },
      { source: "/resident/home/:path*", destination: "/resident/properties", permanent: false },
      { source: "/resident/leases", destination: "/resident/lease", permanent: false },
      { source: "/resident/leases/:path*", destination: "/resident/lease", permanent: false },
      { source: "/resident/announcements", destination: "/resident/dashboard", permanent: false },
      { source: "/resident/announcements/:path*", destination: "/resident/dashboard", permanent: false },
      { source: "/resident/documents", destination: "/resident/profile", permanent: false },
      { source: "/resident/documents/:path*", destination: "/resident/profile", permanent: false },
      { source: "/resident/settings", destination: "/resident/profile", permanent: false },
      { source: "/resident/settings/:path*", destination: "/resident/profile", permanent: false },
      { source: "/resident/support", destination: "/resident/dashboard", permanent: false },
      { source: "/resident/support/:path*", destination: "/resident/dashboard", permanent: false },
    ];
  },
};

export default nextConfig;

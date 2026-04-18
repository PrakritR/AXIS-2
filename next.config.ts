import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/admin/announcements", destination: "/admin/dashboard", permanent: false },
      { source: "/admin/announcements/:path*", destination: "/admin/dashboard", permanent: false },
      { source: "/admin/leasing", destination: "/admin/leases", permanent: false },
      { source: "/admin/leasing/:path*", destination: "/admin/leases/:path*", permanent: false },
      { source: "/resident/home", destination: "/resident/properties", permanent: false },
      { source: "/resident/home/:path*", destination: "/resident/properties", permanent: false },
      { source: "/resident/lease", destination: "/resident/leases/manager-review", permanent: false },
      { source: "/resident/lease/:path*", destination: "/resident/leases/manager-review", permanent: false },
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

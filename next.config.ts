import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  basePath: '/fusion-widget-manager',
  images: {
    unoptimized: true,
  },
};

export default nextConfig;

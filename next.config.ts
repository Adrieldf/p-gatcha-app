import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  // Adds the repository name as a prefix to all paths
  // Required for GitHub Pages when hosting on a subpath rather than a custom domain
  basePath: '/p-gatcha-app',
  assetPrefix: '/p-gatcha-app/',
};

export default nextConfig;

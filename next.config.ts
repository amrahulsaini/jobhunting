import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Ships a self-contained server with only the modules actually used, so the
     target box does not need a full node_modules tree or a build step — it has
     under 400MB of free memory and next build would OOM the sites already on it. */
  output: "standalone",
  /* config options here */
};

export default nextConfig;

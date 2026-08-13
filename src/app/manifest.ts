import type { MetadataRoute } from "next";

/**
 * Web app manifest.
 *
 * The icons were generated earlier but never declared, so an installed copy had
 * no name or icon of its own. `name` is what an install prompt and the OS app
 * list show; `short_name` is what fits under a home-screen icon.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "JobHunting",
    short_name: "JobHunting",
    description:
      "Let AI find the jobs that actually match your resume, then write the email for every one of them.",
    start_url: "/dashboard",
    display: "standalone",
    // Matches the black-and-white system rather than a browser default.
    background_color: "#ffffff",
    theme_color: "#0a0a0a",
    icons: [
      { src: "/assets/icons-app/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/assets/icons-app/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/assets/icons-app/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        // Lets Android crop it to the device's icon shape without clipping the mark.
        purpose: "maskable",
      },
    ],
  };
}

import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Point this at the production origin once deployed; it resolves the relative
  // OG image URLs above into absolute ones.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "JobHunting — stop spending hours applying for jobs",
    template: "%s · JobHunting",
  },
  description:
    "Let AI find the jobs that actually match your resume, then write the email for every one of them. Upload your resume once and approve what goes out.",
  applicationName: "JobHunting",
  appleWebApp: { capable: true, title: "JobHunting", statusBarStyle: "default" },
  icons: {
    icon: "/assets/brand/favicon.svg",
    apple: "/assets/icons-app/icon-180.png",
  },
  openGraph: {
    type: "website",
    title: "JobHunting — stop spending hours applying for jobs",
    description:
      "AI finds the jobs that actually match your resume, then writes the email for every one of them.",
    images: [{ url: "/assets/og-image.webp", width: 2400, height: 1340 }],
  },
  twitter: { card: "summary_large_image", images: ["/assets/og-image.webp"] },
};

// Both themes are real designs here, so declare both rather than letting the
// browser guess a form-control palette.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ThemeProvider } from "../context/ThemeContext";
import Header from "../components/Header";
import Footer from "../components/Footer";
import RecoveryRedirect from "../components/admin/RecoveryRedirect";
import "../index.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: { default: "Silas Osunba | Research Engineer & Applied AI Engineer", template: "%s | Silas Osunba" },
  description: "Silas Osunba — machine learning engineer and researcher building intelligent, energy-aware systems. Explore selected projects, research, and technical writing.",
  icons: { icon: "/images/identity-image.png" },
  openGraph: { type: "website", title: "Silas Osunba", description: "Building intelligent and energy-aware systems.", images: [{ url: "/images/identity-image.png", alt: "Silas Osunba" }] },
  twitter: { card: "summary_large_image", images: ["/images/identity-image.png"] },
};
export const viewport: Viewport = { themeColor: "#fafafa" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <RecoveryRedirect />
        <ThemeProvider>
          <div className="flex min-h-screen flex-col bg-canvas text-ink dark:bg-canvas-dark dark:text-ink-dark">
            <a href="#main-content" className="skip-link">Skip to content</a>
            <Header />
            <main id="main-content" tabIndex={-1} className="flex-grow">{children}</main>
            <Footer />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}

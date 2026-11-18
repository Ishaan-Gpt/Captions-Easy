import type { Metadata } from "next";

// password help: kept out of search results
export const metadata: Metadata = { title: "Reset your password · CaptionsEasy", robots: { index: false, follow: true } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

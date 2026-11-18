import type { Metadata } from "next";

// password reset: kept out of search results
export const metadata: Metadata = { title: "Choose a new password · CaptionsEasy", robots: { index: false, follow: true } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

import type { Metadata } from "next";

// device pairing: private, kept out of search results
export const metadata: Metadata = { title: "Pair a device · CaptionsEasy", robots: { index: false, follow: true } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

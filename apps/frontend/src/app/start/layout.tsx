import type { Metadata } from "next";

// the studio entry: kept out of search results, the homepage is the page that ranks
export const metadata: Metadata = { title: "Studio · CaptionsEasy", robots: { index: false, follow: true } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

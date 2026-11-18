import type { Metadata } from "next";

// sign-in screen: kept out of search results (its own title so it never duplicates the homepage)
export const metadata: Metadata = { title: "Sign in · CaptionsEasy", robots: { index: false, follow: true } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

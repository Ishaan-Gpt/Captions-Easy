import type { Metadata } from "next";
import { FAQS } from "@/components/home/faqs";

const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://www.captionseasy.com").replace(/\/$/, "");

// homepage only: other pages keep their own canonical URL
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const structuredData = [
  // who makes it and what the site is: gives Google the brand name and logo for the search result
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "CaptionsEasy",
    url: SITE_URL,
    logo: `${SITE_URL}/brand/captionseasy-icon-512.png`,
    email: "hello@captionseasy.com",
    // add the YouTube / Instagram / X profiles here as they go live (public profiles only)
    sameAs: ["https://github.com/Ishaan-Gpt/Captions-Easy", "https://www.npmjs.com/package/captionseasy"],
  },
  { "@context": "https://schema.org", "@type": "WebSite", name: "CaptionsEasy", url: SITE_URL },
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "CaptionsEasy",
    url: SITE_URL,
    description:
      "Animated, word-timed captions for Reels, Shorts and TikToks, made in your browser. 20+ caption styles, English and Hinglish, MP4 and SRT export.",
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Any (web browser)",
    browserRequirements: "Requires a modern browser with WebAssembly. WebGPU makes captioning faster.",
    offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
    featureList: [
      "Automatic word-timed captions",
      "20+ animated caption styles",
      "English and Hindi / Hinglish speech recognition",
      "MP4 export with burned-in captions",
      "SRT subtitle export",
      "No watermark",
      "Video never leaves your device",
    ],
    image: `${SITE_URL}/opengraph-image.jpg`,
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  },
];

export default function HomeLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
      {children}
    </>
  );
}

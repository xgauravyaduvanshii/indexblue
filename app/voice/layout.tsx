import { Metadata } from "next";

const title = "Indexblue Voice";
const description = "Have a voice conversation with Indexblue. Ask questions, search the web, and get real-time responses with our advanced voice AI assistant.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    url: "https://indexblue.ai/voice",
    siteName: "Indexblue",
    type: "website",
    images: [
      {
        url: "https://indexblue.ai/voice/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Indexblue Voice - AI Voice Assistant",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["https://indexblue.ai/voice/twitter-image.png"],
    creator: "@sciraai",
  },
  alternates: {
    canonical: "https://indexblue.ai/voice",
  },
};

export default function VoiceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

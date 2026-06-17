import type { Metadata } from "next";
import { Fira_Code, Fira_Sans } from "next/font/google";
import "./globals.css";

const firaCode = Fira_Code({
  subsets: ["latin"],
  variable: "--font-fira-code",
  weight: ["400", "500", "600", "700"],
});

const firaSans = Fira_Sans({
  subsets: ["latin"],
  variable: "--font-fira-sans",
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Injection Test-Bench — prompt-injection defense lab",
  description:
    "Paste a system prompt, run a corpus of prompt-injection attacks, and measure attack-success-rate per category with both deterministic canary and LLM-judge verdicts.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${firaCode.variable} ${firaSans.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}

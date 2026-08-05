import type { Metadata } from "next";
import { Geist_Mono, Inter, Noto_Sans_KR } from "next/font/google";
import type { CSSProperties } from "react";

import { Providers } from "@/components/Providers";
import "./globals.css";

const sans = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const sansKr = Noto_Sans_KR({
  variable: "--font-noto-kr",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ditodio — 블로그 포스트 + 쇼츠",
  description: "테마 문체 학습 후 사진·키워드로 블로그 초안을 생성합니다.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${sans.variable} ${sansKr.variable} ${geistMono.variable} h-full antialiased`}
      style={
        {
          ["--font-sans-app" as string]:
            "var(--font-inter), var(--font-noto-kr), sans-serif",
        } as CSSProperties
      }
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

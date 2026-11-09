import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Hireflow — Find your next chapter", description: "An independent recruitment marketplace reconstruction using fictional listings and synthetic candidate data." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}

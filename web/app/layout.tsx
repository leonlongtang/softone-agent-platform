import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, Source_Code_Pro } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

// Both fonts need the greek subset: customer names and addresses are often Greek (DESIGN.md → Visual identity).
const plexSans = IBM_Plex_Sans({ variable: "--font-plex-sans", subsets: ["latin", "greek"], weight: ["400", "500", "600"] });
const sourceCodePro = Source_Code_Pro({ variable: "--font-source-code-pro", subsets: ["latin", "greek"] });

export const metadata: Metadata = {
  title: "SoftOne Agents",
  description: "Chat with the SoftOne ERP agent and see each turn's changes in the tables",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
  themeColor: "#171513", // --bg (dark); Viewport can't read a CSS variable. The theme toggle updates it.
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="dark" className={`${plexSans.variable} ${sourceCodePro.variable}`}>
      <body>
        <TooltipProvider delay={500}>{children}</TooltipProvider>
      </body>
    </html>
  );
}

import "@/app/globals.css";
import { CartProvider } from "@/lib/cart-store";
import { Lora, Noto_Sans, Noto_Sans_SC } from "next/font/google";
import { LayoutShell } from "@/components/layout-shell";

const notoSans = Noto_Sans({
  subsets: ["latin"],
  variable: "--font-noto-sans",
  display: "swap"
});

const lora = Lora({
  subsets: ["latin"],
  variable: "--font-lora",
  display: "swap"
});

const notoSansSc = Noto_Sans_SC({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  // Keep existing variable name to avoid touching every usage site.
  variable: "--font-noto-serif-sc",
  display: "swap"
});

export const metadata = {
  title: "Hong Far Cafe - Pickup Ordering",
  description: "Hong Far Cafe pickup ordering app",
  icons: {
    icon: "/images/hongfarlogo.png",
    shortcut: "/images/hongfarlogo.png",
    apple: "/images/hongfarlogo.png"
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${notoSans.variable} ${lora.variable} ${notoSansSc.variable}`}>
        <CartProvider>
          <LayoutShell>{children}</LayoutShell>
        </CartProvider>
      </body>
    </html>
  );
}

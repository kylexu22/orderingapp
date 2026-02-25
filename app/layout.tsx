import "@/app/globals.css";
import { CartProvider } from "@/lib/cart-store";
import { Lora, Noto_Serif_SC } from "next/font/google";
import { LayoutShell } from "@/components/layout-shell";

const lora = Lora({
  subsets: ["latin"],
  variable: "--font-lora",
  display: "swap"
});

const notoSerifSc = Noto_Serif_SC({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
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
      <body className={`${lora.variable} ${notoSerifSc.variable}`}>
        <CartProvider>
          <LayoutShell>{children}</LayoutShell>
        </CartProvider>
      </body>
    </html>
  );
}

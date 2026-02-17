import "@/app/globals.css";
import { CartProvider } from "@/lib/cart-store";
import { SiteHeader } from "@/components/site-header";
import { CartToast } from "@/components/cart-toast";
import { CustomerFooter } from "@/components/customer-footer";
import { Lora, Noto_Serif_SC } from "next/font/google";

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
  description: "Hong Far Cafe pickup ordering app"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${lora.variable} ${notoSerifSc.variable}`}>
        <CartProvider>
          <SiteHeader />
          <main className="mx-auto w-full max-w-6xl px-4 py-4">{children}</main>
          <CustomerFooter />
          <CartToast />
        </CartProvider>
      </body>
    </html>
  );
}

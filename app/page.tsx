import Image from "next/image";
import Link from "next/link";
import { getMenuData } from "@/lib/menu";
import { getStoreOrderState } from "@/lib/store-status";
import { StoreHours } from "@/lib/types";

const galleryImages = [
  "/images/gallery/unnamed.webp",
  "/images/gallery/unnamed (1).webp",
  "/images/gallery/unnamed (2).webp",
  "/images/gallery/unnamed (3).webp",
  "/images/gallery/unnamed (4).webp",
  "/images/gallery/unnamed (5).webp"
];

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  const { settings } = await getMenuData();
  const orderState = settings
    ? getStoreOrderState({
        acceptingOrders: settings.acceptingOrders,
        timezone: settings.timezone,
        storeHours: settings.storeHours as StoreHours,
        closedDates: settings.closedDates as string[]
      })
    : "OPEN";

  const isOpenNow = orderState === "OPEN";
  const orderCta = isOpenNow ? "ORDER NOW" : "VIEW MENU";

  return (
    <div className="hf-root">
      <main>
        <section className="hf-hero">
          <div className="hf-hero-content">
            <Image
              src="/images/hongfarlogo.png"
              alt="Hong Far Cafe"
              width={900}
              height={488}
              className="hf-hero-logo"
              priority
            />
            <h1 className="hf-hero-title">Hong Far Cafe</h1>
            <p className="hf-hero-tagline">
              Traditional Hong Kong cha chaan teng and Cantonese diner in Richmond Hill.
            </p>
            {isOpenNow ? <div className="hf-open-now">OPEN NOW</div> : <div className="hf-closed-now">CLOSED</div>}
            <Link href="/menu" className="hf-order-btn">
              {orderCta}
            </Link>
            <a href="tel:+19057709236" className="hf-hero-phone-btn" aria-label="Call (905) 770-9236">
              <span className="hf-hero-phone-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false">
                  <path d="M6.6 10.8a15.2 15.2 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1.1-.3 1.2.4 2.4.6 3.7.6.6 0 1 .4 1 1V21c0 .6-.4 1-1 1C10.1 22 2 13.9 2 3.9c0-.6.4-1 1-1h4.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.7.1.4 0 .8-.3 1.1l-2.2 2.1z" />
                </svg>
              </span>
              <span className="hf-hero-phone-text">(905) 770-9236</span>
            </a>
          </div>
        </section>

        <section id="hours" className="hf-hours">
          <div className="hf-wrap hf-hours-grid">
            <div>
              <h2>Hours & Location</h2>
              <p className="hf-address">
                <a
                  href="https://www.google.com/maps/search/?api=1&query=9425+Leslie+St,Richmond+Hill,ON+L4B+3N7,Canada"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  9425 Leslie St
                  <br />
                  Richmond Hill, ON L4B 3N7
                  <br />
                  Ontario, Canada
                </a>
              </p>
              <dl className="hf-hours-list">
                <dt>Monday, Tuesday, Thursday, Friday</dt>
                <dd>11AM - 10PM</dd>
                <dt>Saturday, Sunday</dt>
                <dd>10AM - 10PM</dd>
                <dt>Wednesday</dt>
                <dd>Closed</dd>
              </dl>
              <Link href="/menu" className="hf-order-btn">
                {orderCta}
              </Link>
            </div>
            <div className="hf-map-wrap">
              <iframe
                className="hf-map"
                src="https://www.google.com/maps?q=9425+Leslie+St,Richmond+Hill,ON+L4B+3N7,Canada&output=embed"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title="Hong Far Restaurant location"
              />
            </div>
          </div>
        </section>

        <section id="gallery" className="hf-gallery">
          <div className="hf-wrap">
            <h2>Gallery</h2>
            <div className="hf-gallery-grid">
              {galleryImages.map((src) => (
                <div key={src} className="hf-gallery-item">
                  <Image src={src} alt="Hong Far dish" width={1000} height={750} />
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="hf-footer">
        <div className="hf-footer-inner">
          <Image src="/images/hongfarlogo.png" alt="Hong Far Cafe logo" width={260} height={140} />
          <p className="hf-footer-brand-cn">鴻發餐廳</p>
          <p className="hf-footer-brand">Hong Far Cafe</p>
          <p>9425 Leslie St, Richmond Hill, ON</p>
          <p>
            <a href="tel:+19057709236">(905) 770-9236</a>
          </p>
          <p className="hf-footer-copy">Copyright 2026 HONG FAR H.K. CAFE INC.</p>
        </div>
      </footer>
    </div>
  );
}

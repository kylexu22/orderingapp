"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function LandingNav({ orderCta }: { orderCta: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.classList.toggle("hf-nav-open", open);
    return () => document.body.classList.remove("hf-nav-open");
  }, [open]);

  return (
    <header className={`hf-nav ${open ? "is-open" : ""}`}>
      <div className="hf-nav-inner">
        <a href="#" className="hf-logo-text">
          <span className="hf-logo-cn">鴻發餐廳</span>
          <span className="hf-logo-en">Hong Far Cafe</span>
        </a>

        <nav className="hf-nav-links" aria-label="Primary">
          <a href="#gallery">Gallery</a>
          <a href="#hours">Hours & Location</a>
        </nav>

        <Link href="/menu" className="hf-nav-cta">
          {orderCta}
        </Link>

        <button
          type="button"
          className={`hf-mobile-toggle ${open ? "is-open" : ""}`}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((prev) => !prev)}
        >
          <span className="hf-mobile-toggle-line" />
          <span className="hf-mobile-toggle-line" />
          <span className="hf-mobile-toggle-line" />
        </button>
      </div>

      <button
        type="button"
        className={`hf-mobile-backdrop ${open ? "is-open" : ""}`}
        aria-label="Close menu"
        onClick={() => setOpen(false)}
      />

      <aside className={`hf-mobile-drawer ${open ? "is-open" : ""}`} aria-hidden={!open}>
        <nav className="hf-mobile-drawer-nav">
          <a href="#gallery" onClick={() => setOpen(false)}>
            Menu
          </a>
          <a href="#hours" onClick={() => setOpen(false)}>
            Hours & Location
          </a>
          <Link href="/menu" className="hf-mobile-drawer-cta" onClick={() => setOpen(false)}>
            {orderCta}
          </Link>
        </nav>
      </aside>
    </header>
  );
}

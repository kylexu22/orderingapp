"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const galleryImages = [
  "/images/gallery/unnamed.webp",
  "/images/gallery/unnamed (1).webp",
  "/images/gallery/unnamed (2).webp",
  "/images/gallery/unnamed (3).webp",
  "/images/gallery/unnamed (4).webp",
  "/images/gallery/unnamed (5).webp"
];

export default function HomePage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [slide, setSlide] = useState(0);
  const navRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (menuOpen) {
      document.body.classList.add("nav-open");
    } else {
      document.body.classList.remove("nav-open");
    }
    return () => document.body.classList.remove("nav-open");
  }, [menuOpen]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="hf-site">
      <header className={`nav-bar ${menuOpen ? "is-open" : ""}`} id="nav-bar" ref={navRef}>
        <nav className="nav-inner">
          <a href="#" className="nav-logo-text">
            <span className="nav-logo-cn">鴻發</span>
            <span className="nav-logo-en">Hong Far Cafe</span>
          </a>
          <ul className="nav-links">
            <li>
              <a href="#gallery">Gallery</a>
            </li>
            <li>
              <a href="#hours">Hours & Location</a>
            </li>
            <li>
              <a href="#contact">Contact</a>
            </li>
          </ul>
          <Link href="/menu" className="nav-cta">
            Order now
          </Link>
          <button
            type="button"
            className="nav-toggle"
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((prev) => !prev)}
          >
            <span className="nav-toggle-line" />
            <span className="nav-toggle-line" />
            <span className="nav-toggle-line" />
          </button>
        </nav>
        <div className="nav-backdrop" aria-hidden={!menuOpen} onClick={() => setMenuOpen(false)} />
        <div className="nav-mobile">
          <ul className="nav-mobile-links">
            <li>
              <a href="#gallery" onClick={() => setMenuOpen(false)}>
                Gallery
              </a>
            </li>
            <li>
              <a href="#hours" onClick={() => setMenuOpen(false)}>
                Hours & Location
              </a>
            </li>
            <li>
              <a href="#contact" onClick={() => setMenuOpen(false)}>
                Contact
              </a>
            </li>
          </ul>
          <Link href="/menu" className="nav-mobile-cta" onClick={() => setMenuOpen(false)}>
            Order now
          </Link>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="hero-overlay" />
          <div className="hero-content">
            <Image
              src="/images/hongfarlogo.png"
              alt="鴻發 Hong Far Cafe"
              width={900}
              height={488}
              className="hero-logo"
              priority
            />
            <p className="hero-tagline">Traditional Hong Kong Cuisine</p>
            <Link href="/menu" className="btn-order">
              Order now
            </Link>
          </div>
        </section>

        <section id="gallery" className="section-gallery">
          <div className="gallery-inner">
            <h2 className="gallery-title">Gallery</h2>
            <div className="carousel">
              <button
                type="button"
                className="carousel-btn carousel-btn--prev"
                aria-label="Previous image"
                onClick={() => setSlide((prev) => (prev - 1 + galleryImages.length) % galleryImages.length)}
              >
                <span aria-hidden="true">‹</span>
              </button>
              <button
                type="button"
                className="carousel-btn carousel-btn--next"
                aria-label="Next image"
                onClick={() => setSlide((prev) => (prev + 1) % galleryImages.length)}
              >
                <span aria-hidden="true">›</span>
              </button>
              <div className="carousel-track-wrap">
                <div className="carousel-track" style={{ transform: `translateX(-${slide * 100}%)` }}>
                  {galleryImages.map((src) => (
                    <div key={src} className="carousel-slide">
                      <Image src={src} alt="Hong Far Restaurant" width={1000} height={750} loading="lazy" />
                    </div>
                  ))}
                </div>
              </div>
              <div className="carousel-dots" role="tablist" aria-label="Gallery slides">
                {galleryImages.map((src, idx) => (
                  <button
                    key={src}
                    type="button"
                    role="tab"
                    aria-label={`Go to slide ${idx + 1}`}
                    aria-selected={idx === slide}
                    className={idx === slide ? "is-active" : ""}
                    onClick={() => setSlide(idx)}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="contact" className="section-contact">
          <div className="section-inner">
            <h2>Contact</h2>
            <p className="contact-subtext">Call us directly for reservations and takeout.</p>
            <p className="contact-phone">
              <a href="tel:+19057709236" aria-label="Call (905) 770-9236">
                <span className="phone-number">(905) 770-9236</span>
              </a>
            </p>
          </div>
        </section>

        <section id="hours" className="section-hours">
          <div className="hours-inner">
            <h2 className="hours-title">Hours & Location</h2>
            <div className="hours-grid">
              <div className="hours-info">
                <h3>Address</h3>
                <p className="hours-address">
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
                <h3>Hours</h3>
                <dl className="hours-list">
                  <dt>Monday, Tuesday, Thursday, Friday</dt>
                  <dd>11AM - 10PM</dd>
                  <dt>Saturday, Sunday</dt>
                  <dd>10AM - 10PM</dd>
                  <dt>Wednesday</dt>
                  <dd>Closed</dd>
                </dl>
                <Link href="/menu" className="btn-order">
                  Order now
                </Link>
              </div>
              <div className="hours-map-wrap">
                <iframe
                  className="hours-map"
                  src="https://www.google.com/maps?q=9425+Leslie+St,Richmond+Hill,ON+L4B+3N7,Canada&output=embed"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  title="Hong Far Restaurant location on Google Maps"
                />
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="site-footer-inner">
          <Image src="/images/hongfarlogo.png" alt="Hong Far Cafe logo" width={260} height={140} className="site-footer-logo" />
          <p className="site-footer-brand">Hong Far Cafe</p>
          <p className="site-footer-meta">9425 Leslie St, Richmond Hill, ON</p>
          <p className="site-footer-meta">
            <a href="tel:+19057709236" className="phone-number">
              (905) 770-9236
            </a>
          </p>
          <p className="site-footer-copy">Copyright 2026 HONG FAR H.K. CAFE INC.</p>
        </div>
      </footer>

      <style jsx global>{`
        .hf-site {
          font-family: 'Lora', 'Noto Serif SC', Georgia, serif;
          color: #2c2420;
          background: #f5f0e8;
          line-height: 1.55;
          min-height: 100vh;
        }
        .nav-bar { position: fixed; top: 0; left: 0; right: 0; z-index: 100; background: #1a1a1a; color: #f5f0e8; box-shadow: 0 2px 20px rgba(0,0,0,.3); }
        .nav-inner { max-width: 1200px; margin: 0 auto; padding: .75rem 1.5rem; display:flex; align-items:center; justify-content:space-between; }
        .nav-logo-text { display:inline-flex; gap:.4em; color:#f5f0e8; text-decoration:none; font-family:'Noto Serif SC',serif; font-size:1.5rem; font-weight:600; }
        .nav-logo-en { font-size:1rem; opacity:.9; }
        .nav-links { list-style:none; display:flex; gap:2rem; }
        .nav-links a { color: rgba(245,240,232,.9); text-decoration:none; }
        .nav-cta, .nav-mobile-cta, .btn-order { display:inline-block; background:#8b2e24; color:#fff; text-decoration:none; text-transform:uppercase; letter-spacing:.08em; font-weight:600; }
        .nav-cta { padding:.5rem 1.25rem; }
        .nav-toggle { display:none; width:44px; height:44px; background:transparent; border:none; color:#f5f0e8; }
        .nav-toggle-line { display:block; width:22px; height:2px; background:currentColor; margin:5px auto; }
        .nav-backdrop { display:none; position:fixed; inset:0; background:rgba(0,0,0,.5); }
        .nav-mobile { display:none; position:fixed; top:0; right:0; bottom:0; width:min(85%,300px); background:#1a1a1a; padding:5rem 1.5rem 2rem; transform:translateX(100%); transition:transform .35s; }
        .nav-mobile-links { list-style:none; }
        .nav-mobile-links a { color:#f5f0e8; text-decoration:none; display:block; padding:1rem 0; }
        .nav-mobile-cta { margin-top:1rem; padding:1rem 1.5rem; text-align:center; }
        .nav-bar.is-open .nav-mobile { transform:translateX(0); }
        .nav-bar.is-open .nav-backdrop { display:block; }
        .hero { min-height:100vh; display:flex; align-items:center; justify-content:center; padding-top:84px; background: linear-gradient(165deg,#faf8f4 0%,#f2ede6 35%,#ebe6df 100%); position:relative; }
        .hero-content { text-align:center; padding:2rem; }
        .hero-logo { width:min(420px,85vw); height:auto; }
        .hero-tagline { margin:1rem 0 2rem; letter-spacing:.08em; }
        .btn-order { padding:.9rem 2.2rem; }
        .section-gallery, .section-contact, .section-hours { padding:4rem 1.5rem; }
        .gallery-inner, .hours-inner, .section-inner { max-width:1100px; margin:0 auto; }
        .gallery-title, .hours-title { font-size:1.75rem; margin-bottom:1rem; }
        .carousel { position:relative; }
        .carousel-track-wrap { overflow:hidden; }
        .carousel-track { display:flex; transition:transform .45s ease; }
        .carousel-slide { min-width:100%; }
        .carousel-slide img { width:100%; height:520px; object-fit:cover; display:block; }
        .carousel-btn { position:absolute; top:50%; transform:translateY(-50%); z-index:2; width:44px; height:44px; border:none; background:rgba(0,0,0,.45); color:#fff; }
        .carousel-btn--prev { left:.75rem; }
        .carousel-btn--next { right:.75rem; }
        .carousel-dots { display:flex; justify-content:center; gap:.5rem; margin-top:.75rem; }
        .carousel-dots button { width:10px; height:10px; border:none; background:#c4a574; opacity:.5; }
        .carousel-dots button.is-active { opacity:1; background:#8b2e24; }
        .section-contact { background:linear-gradient(180deg,#efe7db 0%,#f1eadf 100%); }
        .contact-phone a { color:#8b2e24; font-size:1.25rem; text-decoration:none; }
        .hours-grid { display:grid; grid-template-columns:1fr 1.2fr; gap:2rem; align-items:start; }
        .hours-map-wrap { min-height:360px; border:1px solid rgba(0,0,0,.12); }
        .hours-map { width:100%; height:100%; min-height:360px; border:0; }
        .hours-list { margin-top:.5rem; }
        .hours-list dt { font-weight:600; margin-top:.5rem; }
        .site-footer { background:#1a1a1a; color:#f5f0e8; padding:3rem 1.5rem; text-align:center; }
        .site-footer-logo { width:min(170px,58vw); height:auto; margin:0 auto .75rem; }
        .site-footer-copy { margin-top:.75rem; font-size:.75rem; opacity:.75; text-transform:uppercase; letter-spacing:.08em; }
        @media (max-width: 768px) {
          .nav-links, .nav-cta { display:none; }
          .nav-toggle, .nav-mobile, .nav-backdrop { display:block; }
          .hours-grid { grid-template-columns: 1fr; }
          .carousel-slide img { height:300px; }
        }
      `}</style>
    </div>
  );
}

import Image from "next/image";
import Link from "next/link";

const galleryImages = [
  "/images/gallery/unnamed.webp",
  "/images/gallery/unnamed (1).webp",
  "/images/gallery/unnamed (2).webp",
  "/images/gallery/unnamed (3).webp",
  "/images/gallery/unnamed (4).webp",
  "/images/gallery/unnamed (5).webp"
];

export default function HomePage() {
  return (
    <div className="space-y-10">
      <section className="relative -mx-4 min-h-[62vh] overflow-hidden border-b border-amber-900/15 bg-gradient-to-b from-[#faf8f4] via-[#f2ede6] to-[#ebe6df] px-4 py-12">
        <div className="mx-auto flex max-w-4xl flex-col items-center justify-center gap-5 text-center">
          <Image
            src="/images/hongfarlogo.png"
            alt="Hong Far Cafe"
            width={420}
            height={220}
            className="h-auto w-[min(85vw,420px)]"
            priority
          />
          <p className="max-w-2xl text-base text-[#2c2420]/85 sm:text-lg">
            Traditional Hong Kong cha chaan teng and Cantonese dinner in Richmond Hill.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/menu"
              className="bg-[#8b2e24] px-6 py-3 text-base font-semibold uppercase tracking-[0.08em] text-[#f5f0e8] transition hover:bg-[#6b221a]"
            >
              Order Now
            </Link>
            <a
              href="#hours-location"
              className="border border-[#8b2e24] px-6 py-3 text-base font-semibold uppercase tracking-[0.08em] text-[#8b2e24] transition hover:bg-[#8b2e24] hover:text-white"
            >
              Hours & Location
            </a>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold text-[#2c2420]">Gallery</h2>
          <Link href="/menu" className="text-sm font-semibold text-[#8b2e24] underline">
            Order now
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {galleryImages.map((src) => (
            <div key={src} className="overflow-hidden border border-amber-900/20 bg-white">
              <Image
                src={src}
                alt="Hong Far dish"
                width={1000}
                height={750}
                className="h-60 w-full object-cover"
              />
            </div>
          ))}
        </div>
      </section>

      <section id="hours-location" className="-mx-4 bg-[#efe7db] px-4 py-8">
        <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-[#2c2420]">Hours & Location</h2>
            <p className="text-[#2c2420]/85">
              9425 Leslie St, Richmond Hill, ON L4B 3N7
              <br />
              Phone: (905) 770-9236
            </p>
            <div className="space-y-1 text-sm text-[#2c2420]/90">
              <p>Mon, Tue, Thu, Fri: 11:00 AM - 10:00 PM</p>
              <p>Sat, Sun: 10:00 AM - 10:00 PM</p>
              <p>Wednesday: Closed</p>
            </div>
            <Link
              href="/menu"
              className="mt-2 inline-block bg-[#8b2e24] px-5 py-2.5 text-sm font-semibold uppercase tracking-[0.08em] text-[#f5f0e8] transition hover:bg-[#6b221a]"
            >
              Order Now
            </Link>
          </div>
          <div className="h-[320px] overflow-hidden border border-amber-900/20 bg-white">
            <iframe
              className="h-full w-full"
              src="https://www.google.com/maps?q=9425+Leslie+St,Richmond+Hill,ON+L4B+3N7,Canada&output=embed"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              title="Hong Far Cafe location"
            />
          </div>
        </div>
      </section>
    </div>
  );
}

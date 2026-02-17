# OrderingSystemApp (Pickup-Only)

Single-restaurant online ordering app for cha chaan teng + Cantonese dinner.

## Stack

- Next.js 14 (App Router) + TypeScript + TailwindCSS
- Next.js Route Handlers (REST + SSE)
- Prisma ORM + PostgreSQL
- Admin password auth via cookie session

## Features

- Customer menu browse (`/`, `/item/[id]`, `/combo/[id]`)
- Complex modifier and combo selection engine
- Cart + checkout (pickup only, no delivery, no online payment)
- Pickup types:
  - `ASAP` with estimated ready time from prep/interval
  - `SCHEDULED` slots constrained by store hours
- Admin iPad console (`/admin/orders`) with:
  - Live updates via SSE (`/api/orders/stream`)
  - Status transitions (`NEW -> ACCEPTED -> READY -> PICKED_UP`, `CANCELLED`)
  - Print/Reprint button (browser print workflow, two print calls)
- Printable 80mm ticket route: `/api/orders/[orderNumber]/ticket`
- Read-only admin menu page (`/admin/menu`)
- Seed data includes 3 categories, 10 items, 2 combos

## Environment Variables

Copy `.env.example` to `.env`:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ordering_system?schema=public"
ADMIN_PASSWORD="change_me"
TAX_RATE="0.13"
RESTAURANT_NAME="Sample Cha Chaan Teng"
NEXT_PUBLIC_STAR_WEBPRNT_URL=""
```

## Local Development

1. Start Postgres:

```bash
docker compose up -d
```

2. Install dependencies:

```bash
npm install
```

3. Generate Prisma client + migrate + seed:

```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

Seed behavior:

- Default `npm run prisma:seed` runs in safe `sync` mode (adds missing seed records, preserves existing edits in Prisma Studio).
- Full rebuild mode (destructive):
  - macOS/Linux: `SEED_MODE=reset npm run prisma:seed`
  - PowerShell: `$env:SEED_MODE='reset'; npm run prisma:seed`
  - Use this only when you intentionally want to wipe/recreate menu seed data.

4. Start app:

```bash
npm run dev
```

## API Routes

- `GET /api/menu`
- `POST /api/orders`
- `GET /api/orders?status=NEW`
- `PATCH /api/orders/[id]`
- `GET /api/orders/stream` (SSE)
- `GET /api/orders/[orderNumber]/ticket` (80mm printable HTML)

## Printing Notes (iPad + Star TSP100III)

- Default implementation: browser print fallback.
- Admin `Print x2` opens ticket page and triggers `window.print()` twice.
- If browser blocks automatic repeats, manually set copies to `2` in print dialog.
- Optional Star WebPRNT mode is available in `/admin/orders`:
  - Set `NEXT_PUBLIC_STAR_WEBPRNT_URL` (example: `http://<printer-ip>:8001/StarWebPRNT/SendMessage`)
  - Switch Print Mode to `Star WebPRNT (Optional)`
  - If WebPRNT fails, app falls back to browser print.

## iPad + Printer Validation Checklist

1. Open `/admin/orders` on the iPad and confirm live new-order updates.
2. Create a test order from customer flow and verify it appears at top as `NEW`.
3. Press `Print x2` in `Browser Fallback` mode and confirm two physical tickets print.
4. Confirm ticket formatting: header, order number, pickup time, combo/modifier indentation, totals, `PAY AT PICKUP (CASH)`.
5. If using WebPRNT, configure `NEXT_PUBLIC_STAR_WEBPRNT_URL`, switch mode, and verify two copies print.
6. If WebPRNT has CORS/network issues, keep browser mode as production-safe fallback.

## Deployment

- Frontend/API: Vercel
- Database: Supabase Postgres
- Set all env vars in Vercel project settings.
- Ensure `DATABASE_URL` points to Supabase/Postgres connection string.

## Security/Reliability (MVP)

- Admin pages + admin order APIs protected by password cookie session
- Checkout route has basic in-memory per-IP rate limiting
- Hidden honeypot field checked at checkout
- Order creation and print attempts are logged on server

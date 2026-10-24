# Aleksova Beauty Studio

A local-first booking and owner dashboard built from the two supplied Lovable prototypes. The public website/booking flow follows `pixel-perfect-replication`; the owner workspace follows `vital-visor`. Both reference checkouts are kept separately in the parent workspace.

## Stack and Local Data

- TanStack Start, React 19, TypeScript, Vite, and Tailwind CSS.
- PostgreSQL-compatible PGlite embedded in the Node process. It stores data in `.data/postgres` and does not require Docker or a separately installed PostgreSQL server.
- Drizzle ORM migrations and Better Auth email/password sessions.
- English and EUR, matching the prototypes. Business time is `Europe/Sofia`.

Docker is not installed in the current environment. PGlite provides the local PostgreSQL engine and persistent database file for development. The app does not use browser storage as a database.

## Requirements

- Node.js 22 or newer and npm.
- The current machine has Node 18/npm 9, which is too old for this Vite version. Install Node 22 with a version manager before using the commands below. A temporary runner is also available, for example `npx --yes --package=node@22 --package=npm@10 npm test`.

## First Run

```sh
npm install --legacy-peer-deps
npm run env:setup
```

`env:setup` creates `.env` with mode `0600`, preserves the local-only demo email `admin@aleksova.test`, and generates a fresh random `BETTER_AUTH_SECRET` without printing it. Change `OWNER_EMAIL` in `.env` if you prefer another sign-in email. Do not commit `.env` or share the secret.

Then initialize the local database and owner account:

```sh
npm run db:migrate
npm run db:seed
npm run owner:setup
```

`owner:setup` uses the demo display name `Demo Admin` and prompts for a 12-128 character password without echoing it. It refuses to create an account if the database already contains a user. Public registration stays disabled during normal app operation.

`db:seed` is an explicit, non-overwriting development fixture command. It adds the prototype's sample lash/makeup services and weekly hours only; it creates no clients or bookings. Names, prices, durations, descriptions, and hours are not confirmed business information. Review and edit them in `/admin` before enabling online bookings. The public page labels the sample values, and missing address, phone, introduction, and portfolio imagery are marked as placeholders.

Start the app:

```sh
npm run dev -- --port 3000
```

Preview: http://localhost:3000

Owner dashboard: http://localhost:3000/admin. Unauthenticated visitors are redirected to `/login`; server endpoints independently enforce the owner session.

## Common Commands

```sh
npm run db:migrate       # apply tracked migrations
npm run db:seed          # insert missing development service/hour fixtures
npm run owner:setup      # one-time secure owner account setup
npm run dev              # local development server
npm test                 # automated unit and PGlite integration tests
npm run lint             # ESLint
npx tsc --noEmit         # TypeScript check
npm run build            # production bundle
npm start                # run the built server
```

To remove local application data, stop the app and remove `.data/postgres` yourself. Database contents are intentionally ignored by Git.

## Implemented Behavior

- Public home, services, portfolio, studio, contact placeholders, and four-step guest booking flow.
- Server-calculated availability using weekly hours, breaks, date exceptions, blocked intervals, service durations/buffers, advance notice, booking horizon, and pending expiry.
- Bookings are stored in UTC instants; business dates and times use `Europe/Sofia`. Pending requests reserve slots until status changes or expiry. Expired pending requests stop blocking even before cleanup.
- A PostgreSQL GiST exclusion constraint plus transactional advisory locking prevents overlapping reservations and races with blocks/reschedules.
- Owner overview, weekly calendar/agenda, search/status/service filters, appointment drawer, manual booking, transitions, rescheduling, weekly hours, date exceptions, breaks, blocks, service archive/edit, income, partial payments, refunds, and append-only corrections.
- Appointment price/duration snapshots remain unchanged after service edits. Appointment and payment statuses are independent.
- Better Auth email/password authentication, owner-email authorization on the server, rate limits for login and public booking, same-origin mutation checks, and HTTP-only same-site cookies.
- Notification provider interface with a local preview. Local development does not send email or SMS; successful bookings are still saved if a notification provider is unavailable.

## Limitations and Security Notes

- No email/SMS provider is configured. The booking confirmation explicitly says no message was sent. A provider can be supplied through the notification interface later.
- Business contact information, owner introduction, portfolio images, and seeded service/hour values need owner confirmation. Do not publish the samples as real information.
- PGlite is intended here for local development. This work has not verified production hosting, backups, monitoring, TLS, secret rotation, multi-owner access, or provider delivery. Do not treat this app as production-ready.
- The reference prototypes contain no real backend, account system, or persistent business data; their browser-only sample clients/bookings were not copied or seeded.
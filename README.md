# Gear-Hub

Logistics and equipment management for an infantry company: numbered combat equipment (צל"ם), ammunition, the 98 personal kits with digital sign-out, and company emergency storage (בימ"ח). Hebrew only, RTL, mobile-first.

## Stack

- **Next.js 16** (App Router, Cache Components, `src/proxy.ts`), React 19, TypeScript
- **Tailwind CSS v4** + shadcn/ui-style components (`src/components/ui`)
- **PostgreSQL** via **Prisma 7** (`prisma-client` generator + `@prisma/adapter-pg`, no Rust engine)
- Auth: username/password (bcrypt) + signed JWT cookie (`jose`); roles `ADMIN` / `REGULAR`

## Getting started

```bash
npm install
cp .env.example .env          # fill in DATABASE_URL, DIRECT_URL, SESSION_SECRET
npm run db:migrate            # apply migrations
npm run db:seed               # admin user, catalog, kits 1–98 (SEED_DEMO=1 for sample data)
npm run dev
```

No local Postgres? `npx prisma dev -d -n gearhub` starts a local Prisma Postgres. Put its `TCP` URL (`postgres://...`) in both `DATABASE_URL` and `DIRECT_URL`, and its shadow-database URL in `SHADOW_DATABASE_URL`. Without that, `prisma migrate dev` fails with "type ... already exists".

If `SEED_ADMIN_PASSWORD` is empty, the seed generates a password and prints it once.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js (build runs `prisma generate` first) |
| `npm run typecheck` / `lint` | `tsc --noEmit` / ESLint |
| `npm run db:migrate` | `prisma migrate dev` (local) |
| `npm run db:deploy` | `prisma migrate deploy` (CI / production) |
| `npm run db:seed` | Seed admin user, catalog, and 98 kits (safe to re-run) |
| `npm run db:studio` | Prisma Studio |

## Project layout

```
prisma/
  schema.prisma          data model (see comments in the file)
  seed.ts                idempotent seed
prisma.config.ts         Prisma 7 config: migrations use DIRECT_URL
src/
  proxy.ts               optimistic auth redirect (Next 16 "middleware")
  app/
    layout.tsx           <html lang="he" dir="rtl">, Heebo font
    login/               login page + server actions (login / logout)
    (app)/               authenticated shell: sidebar, header, bottom nav
      page.tsx           main dashboard
      search/            global search (serial, soldier, kit number)
      roster/ equipment/ ammo/ kits/ storage/   module pages (placeholders for now)
      catalog/ users/    admin-only (requireAdmin)
  components/
    ui/                  button, card, input, label, badge, progress
    layout/              sidebar-nav, bottom-nav, app-header, global-search
    dashboard/           stat cards, alerts, kit readiness grid, platoon table
  lib/
    prisma.ts            lazy serverless-safe Prisma client (pooled URL)
    auth.ts              data-access layer: requireUser / requireAdmin / sessions
    session.ts           JWT encrypt / decrypt (shared with proxy)
    constants.ts         Hebrew labels for every enum + business rules
    kit.ts               sign-out checklist definition + readiness calculation
    queries/dashboard.ts dashboard aggregation
```

## Conventions

- **Hebrew only.** Never render raw enum values; use the label maps in `src/lib/constants.ts`.
- **RTL.** Use logical utilities only: `ms-/me-/ps-/pe-/start-/end-/text-start/text-end/border-s/border-e`. Never `ml-/mr-/pl-/pr-/left-/right-/text-left/text-right`. Wrap LTR content such as serial numbers in `ltr-text`. Flip directional icons with `rtl:-scale-x-100`. "Forward" chevrons point left (`ChevronLeft`).
- **Authorization lives in the DAL.** Every page and server action calls `requireUser()` or `requireAdmin()`. `proxy.ts` only does an optimistic redirect.
- **Cache Components.** Anything that reads cookies, `searchParams`, `usePathname`, or the clock must sit inside `<Suspense>` (`(app)/loading.tsx` covers pages). Call `await connection()` before using `Date.now()` in data functions.
- **Soldier picker.** Anywhere a soldier is chosen, use `<SoldierSelect options={await getSoldierOptions()} />` (`src/components/soldier-select.tsx`). The options are cached under the `soldiers` tag; any server action that changes the roster must call `updateTag(SOLDIERS_TAG)`.
- **Equipment moves go through one function.** Any change to an item's holder, status or platoon must use `applyAssignment()` (`src/lib/equipment-service.ts`). It fills in the platoon from the soldier, applies the status rules in `src/lib/equipment-rules.ts`, and writes the `EquipmentLog` history entry. "Not verified in 7 days" is `staleWhere()` in the same rules file, shared by the dashboard and the equipment list.
- **Catalog types.** Dropdowns read active types with `getActiveCategories(domain)` (`src/lib/queries/catalog.ts`), cached under the `catalog` tag. Catalog actions call `updateTag(CATALOG_TAG)`. A type that's in use can only be deactivated, not deleted. Creating a STORAGE type also opens its empty תקן/מצאי row.
- **Ammunition movements.** Every quantity change (ספירה / קליטה / ניפוק) goes through `recordMovement` (`src/app/(app)/ammo/actions.ts`). It locks the stock row, applies `applyMovement()` from `src/lib/ammo-rules.ts` (an issue can never take stock below zero), and writes an `AmmoLog` entry. Low stock uses `isLowStock()`, shared with the dashboard.
- **Personal kits.** The checklist is `KIT_ITEMS` in `src/lib/kit.ts`, backed by boolean columns on `PersonalKit`. Toggles save immediately (`setKitItem`), and "סיום מסדר" stores a `KitInspection` snapshot of the missing items. Linking a kit's personal weapon from the armory hands it to the soldier through `applyAssignment()`. Reassigning a kit clears its signature and weapon link. The printable form is `/kits/[n]/sheet`, and the app shell is hidden in print (`print:hidden`).
- **Storage status is derived.** `StorageItem.status` stores only the manual "בלאי" flag (`OK` / `DAMAGED`). The status shown everywhere comes from `effectiveStatus(storageFlags(item))` in `src/lib/storage-rules.ts`: expired > shortage > damaged > OK. That way, items that expire while nobody touches them still show correctly. The dashboard uses the same flags. Types marked "requires expiry" must have an expiry date (the nearest one in stock) whenever stock is above zero.
- **Users.** Admins create users on `/users`. The system generates a temporary password (`generateTempPassword()` in `src/lib/passwords.ts`) and shows it once; the user changes it on `/account`. Users are never hard-deleted, only deactivated, because history entries reference them. A deactivated user is signed out on their next request. An admin can't demote or deactivate themselves, and the last active admin can't be removed.
- **Login throttling.** Attempts are stored in `LoginAttempt` (`src/lib/login-throttle.ts`), because in-memory counters don't work across serverless instances. 5 failures per username, or 20 per IP, within 15 minutes lock that username or IP until the window passes. A successful login, or an admin password reset, clears the username's failures. Unknown usernames still pay the bcrypt cost, so timing doesn't reveal which usernames exist. Rows older than 24 hours are pruned automatically.
- **Equipment sets.** An item can carry components (`EquipmentItem.parentId`, one level only), for example a נגב with its ציין and קנס״פ. Components always mirror their parent's holder, status and platoon. `applyAssignment()` cascades to them, a component can't be moved on its own while attached, and bulk actions skip components and move them with their parent. Use `attachComponent()` / `detachComponent()` in `src/lib/equipment-service.ts`.
- **No serial yet.** `serialNumber` is nullable ("ללא צ"). Always render it with `<Serial>` and label items with `itemLabel()`; never print the raw value.
- **תקן and the company report.** `EquipmentCategory.targetQuantity` (equipment types) feeds `/equipment/report`, with print, Excel/CSV export at `/equipment/report/export`, and a per-platoon filter. "Held" excludes items marked missing.
- **Platoon colors.** Use `<PlatoonBadge>` / `<PlatoonDot>` (`src/components/platoon-badge.tsx`) wherever a platoon is shown.
- **Migrations deploy automatically.** The Vercel build runs `npm run vercel-build` (`prisma generate && prisma migrate deploy && next build`) using the integration's `DATABASE_URL_UNPOOLED`. A failed migration fails the deploy rather than breaking the live site.
- **Mobile grids.** Give grid and flex children that contain wide content (tables, `min-w-*`) `min-w-0`. Otherwise they can't shrink, and the whole page scrolls sideways on phones.
- **Soft delete.** Soldiers are never hard-deleted (history logs reference them). Removing one from the roster sets `isActive = false` and is blocked while they still hold equipment or a kit.
- **Kit checklist.** To add an item to the sign-out form, add a boolean column to `PersonalKit` and an entry to `KIT_ITEMS` in `src/lib/kit.ts`. Readiness percentages update automatically.
- **Mobile first.** Default tap targets are 44px (`h-11`). The bottom nav is visible below `lg`.

## Deploying to Vercel

1. Create a Postgres database (Supabase, Neon, or Vercel Postgres).
2. In Vercel project settings, set:
   - `DATABASE_URL`: the **pooled** URL (Supabase transaction pooler on port 6543 with `?pgbouncer=true`, or Neon `-pooler` host)
   - `DIRECT_URL`: the direct URL (used only by migrations)
   - `SESSION_SECRET`: 32+ random characters
3. Run `npm run db:deploy` against production (from CI or locally with production env), then `npm run db:seed` once.

The Prisma client uses the `pg` driver adapter with a small per-instance pool and is created lazily, so builds do not need database access.

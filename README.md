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
| `npm run db:seed` | Seed the super-admin, a first company (catalog, storage lines) and its admin; `SEED_DEMO=1` adds a demo deployment (safe to re-run) |
| `npm test` / `npm run test:integration` | Unit tests / integration tests against `TEST_DATABASE_URL` (see `.env.test.example`) |
| `npm run test:mark-db` | One-time: mark a throwaway database as safe for integration tests to wipe |
| `npm run test:e2e` | Browser tests (Playwright, mobile Chrome) against a production build on the test database |
| `npm run db:rehearse` | Run pending migrations + seed on a Neon branch copied from production and verify nothing was lost |
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
- **Multiple companies (tenants).** Companies share nothing. Every company-owned table has `companyId`. App code reaches the database through `companyContext()` / `adminContext()` (`src/lib/context.ts`), which return `{ user, db }`, where `db` is `scopedDb(user.companyId)` (`src/lib/db.ts`): it adds the company to every query and rejects writes for another company. Pass `companyId: user.companyId` on creates. Importing `@/lib/prisma` directly is a lint error outside login, the auth layer and `/admin`. Raw SQL is not scoped, so write the `companyId` condition yourself. Keys that repeat across companies (kit number, serial, personal number, catalog name) are unique per company, so look them up with `findFirst` or the `companyId_…` compound key.
- **Deployments (הפעלות).** The roster, catalog, physical items and storage belong to the company. Who holds which item (`EquipmentAssignment`, one row per item per deployment), the personal kits and the ammo stock belong to one `Deployment`. A company has at most one ACTIVE deployment (enforced by the unique `activeCompanyId`), possibly none; closed ones are read-only history. The header picker sets which deployment the app shows (`gh_deployment` cookie, re-checked every request); `companyContext()` returns it as `deployment`, and its `db` already filters deployment tables to it (empty when there is none). Nested relations from company rows (e.g. a category's `ammoStocks`, an item's `assignments`) are **not** filtered by `scopedDb`: filter them by `deploymentId` yourself; `stateSelect()` / `flattenState()` / `inState()` in `src/lib/equipment-state.ts` do this for item state. Actions that change deployment data use `writableContext()`, which refuses when there is no deployment or it is closed; pages wrap such controls in `<ReadOnlyWhenClosed>` and show `<NoDeploymentCard>` where a deployment is required (`src/components/deployment-gate.tsx`). Every item has a state row in the active deployment: `startDeployment()` (`src/lib/deployment-service.ts`) creates rows for all items (copying from the previous deployment, or starting empty while keeping missing / in-repair / stored), and `createEquipment` adds rows for new items. Admins start and end deployments on `/deployments`.
- **Roles.** `SUPER_ADMIN` belongs to no company: it creates companies and their first admin on `/admin/companies`, then works inside one (choice kept in the `gh_company` cookie, re-checked every request). `ADMIN` / `REGULAR` belong to one company. Use `isCompanyAdmin(role)` (`src/lib/roles.ts`) for admin-only UI, so a super-admin inside a company sees it too. A deactivated company's users are signed out on their next request. New companies get their defaults from `provisionCompany()` (`src/lib/company-setup.ts`), shared with the seed.
- **Authorization lives in the DAL.** Every page and server action calls `companyContext()` / `adminContext()` (or `requireUser()` / `requireAdmin()` when it needs no data). `proxy.ts` only does an optimistic redirect.
- **Cache Components.** Anything that reads cookies, `searchParams`, `usePathname`, or the clock must sit inside `<Suspense>` (`(app)/loading.tsx` covers pages). Call `await connection()` before using `Date.now()` in data functions.
- **Soldier picker.** Anywhere a soldier is chosen, use `<SoldierSelect options={await getSoldierOptions()} />` (`src/components/soldier-select.tsx`). The options are cached per company under `soldiersTag(companyId)`; any server action that changes the roster must call `updateTag(soldiersTag(user.companyId))`.
- **Equipment moves go through one function.** Any change to an item's holder, status or platoon must use `applyAssignment(tx, ctx, itemId, input)` (`src/lib/equipment-service.ts`). It works on one deployment's `EquipmentAssignment` row, fills in the platoon from the soldier, applies the status rules in `src/lib/equipment-rules.ts`, and writes the `EquipmentLog` history entry (tagged with the deployment). "Not verified in 7 days" is `staleWhere()` in the same rules file (a filter on assignment rows), shared by the dashboard and the equipment list.
- **Catalog types.** Dropdowns read active types with `getActiveCategories(domain)` (`src/lib/queries/catalog.ts`), cached per company under `catalogTag(companyId)`. Catalog actions call `updateTag(catalogTag(user.companyId))`. A type that's in use can only be deactivated, not deleted. Creating a STORAGE type also opens its empty תקן/מצאי row.
- **Ammunition movements.** Every quantity change (ספירה / קליטה / ניפוק) goes through `recordMovement` (`src/app/(app)/ammo/actions.ts`). It locks the stock row, applies `applyMovement()` from `src/lib/ammo-rules.ts` (an issue can never take stock below zero), and writes an `AmmoLog` entry. Low stock uses `isLowStock()`, shared with the dashboard.
- **Personal kits.** Each deployment has kits 1–98. The checklist is the company's own list (`KitItemDef`, edited by admins on `/kits/items`: add, rename, regroup, reorder, deactivate, optional expected quantity), with one `KitItemStatus` row per kit per item. Read it through `checklistLines()` / `kitReadiness()` / `lineComplete()` in `src/lib/kit.ts`: a live kit shows the active items, a closed deployment exactly what was recorded. New rows are created by `createKitStatuses()` (`src/lib/kit-service.ts`), starting per the company setting ("new kits start all present / all missing") or copied from the previous deployment. Toggles save immediately (`setKitItem` / `setKitItemQuantity`), and "סיום מסדר" stores a `KitInspection` with the missing items by name. Linking a kit's personal weapon hands it to the soldier through `applyAssignment()` and fulfils the line marked `systemKey: "WEAPON"`. Reassigning a kit clears its signature and weapon link. The printable form is `/kits/[n]/sheet`, and the app shell is hidden in print (`print:hidden`).
- **Storage status is derived.** `StorageItem.status` stores only the manual "בלאי" flag (`OK` / `DAMAGED`). The status shown everywhere comes from `effectiveStatus(storageFlags(item))` in `src/lib/storage-rules.ts`: expired > shortage > damaged > OK. That way, items that expire while nobody touches them still show correctly. The dashboard uses the same flags. Types marked "requires expiry" must have an expiry date (the nearest one in stock) whenever stock is above zero.
- **Users.** Admins create users on `/users`. The system generates a temporary password (`generateTempPassword()` in `src/lib/passwords.ts`) and shows it once; the user changes it on `/account`. Users are never hard-deleted, only deactivated, because history entries reference them. A deactivated user is signed out on their next request. An admin can't demote or deactivate themselves, and the last active admin can't be removed.
- **Login throttling.** Attempts are stored in `LoginAttempt` (`src/lib/login-throttle.ts`), because in-memory counters don't work across serverless instances. 5 failures per username, or 20 per IP, within 15 minutes lock that username or IP until the window passes. A successful login, or an admin password reset, clears the username's failures. Unknown usernames still pay the bcrypt cost, so timing doesn't reveal which usernames exist. Rows older than 24 hours are pruned automatically.
- **Equipment sets.** An item can carry components (`EquipmentItem.parentId`, one level only), for example a נגב with its ציין and קנס״פ. Components always mirror their parent's holder, status and platoon. `applyAssignment()` cascades to them, a component can't be moved on its own while attached, and bulk actions skip components and move them with their parent. Use `attachComponent()` / `detachComponent()` in `src/lib/equipment-service.ts`.
- **No serial yet.** `serialNumber` is nullable ("ללא צ"). Always render it with `<Serial>` and label items with `itemLabel()`; never print the raw value.
- **תקן and the company report.** `EquipmentCategory.targetQuantity` (equipment types) feeds `/equipment/report`, with print, Excel/CSV export at `/equipment/report/export`, and a per-platoon filter. "Held" excludes items marked missing.
- **Platoon colors.** Use `<PlatoonBadge>` / `<PlatoonDot>` (`src/components/platoon-badge.tsx`) wherever a platoon is shown.
- **Migrations that move data run in one transaction.** Prisma applies a migration statement by statement, without a wrapping transaction: a failure halfway leaves the database half-migrated (and temp tables created with `ON COMMIT DROP` vanish immediately). Wrap such migrations in `BEGIN; … COMMIT;`, and rehearse them on a copy of production (`npm run db:rehearse`), which runs them the way Prisma does.
- **Migrations deploy automatically.** The Vercel build runs `npm run vercel-build` (`prisma generate && prisma migrate deploy && next build`) using the integration's `DATABASE_URL_UNPOOLED`. A failed migration fails the deploy rather than breaking the live site.
- **Mobile grids.** Give grid and flex children that contain wide content (tables, `min-w-*`) `min-w-0`. Otherwise they can't shrink, and the whole page scrolls sideways on phones.
- **Soft delete.** Soldiers are never hard-deleted (history logs reference them). Removing one from the roster sets `isActive = false` and is blocked while they still hold equipment or a kit.
- **Mobile first.** Default tap targets are 44px (`h-11`). The bottom nav is visible below `lg`.

## Testing

Three layers, all run in CI (`.github/workflows/ci.yml`, with a throwaway Postgres 17 container):

- **Unit** (`test/unit`, `npm test`): pure rules — equipment status, ammo movements, storage flags, kit readiness, roster import.
- **Integration** (`test/integration`, `npm run test:integration`): server actions and queries against a real Postgres, running the real auth layer (only Next's cookie / redirect APIs are faked). Covers company isolation (two companies with colliding data: nothing leaks either way), deployments (copy / empty start, read-only history, one active per company, no deployment), and the core equipment / kit / ammo flows.
- **End-to-end** (`e2e`, `npm run test:e2e`): a production build in mobile Chrome. Open a deployment, issue and sign a kit, continue into the next deployment, browse the read-only history; super-admin creates a company whose admin signs in to an empty company.

Integration and e2e tests **delete all data** in `TEST_DATABASE_URL` (`.env.test`, see `.env.test.example`). Use a throwaway Neon branch (direct URL) and mark it once with `npm run test:mark-db -- --yes`; tests refuse any database without that marker or equal to the app's own URL. The local `prisma dev` server (PGlite) is not reliable enough for these tests.

## Deploying to Vercel

1. Create a Postgres database (Supabase, Neon, or Vercel Postgres).
2. In Vercel project settings, set:
   - `DATABASE_URL`: the **pooled** URL (Supabase transaction pooler on port 6543 with `?pgbouncer=true`, or Neon `-pooler` host)
   - `DIRECT_URL`: the direct URL (used only by migrations)
   - `SESSION_SECRET`: 32+ random characters
3. Run `npm run db:deploy` against production (from CI or locally with production env), then `npm run db:seed` once.

The Prisma client uses the `pg` driver adapter with a small per-instance pool and is created lazily, so builds do not need database access.

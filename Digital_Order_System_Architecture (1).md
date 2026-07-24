# Digital Order System — Architecture

## 1. Overview

A QR-code-driven, table-side digital ordering platform for restaurants. Customers order from their own device; kitchen, bar, cashier, and admin staff operate synced real-time dashboards off the same order stream.

**Core flow:** Customer scans table QR → browses menu → places order → order streams live to the relevant kitchen/bar station → cashier settles payment → admin monitors everything.

## 2. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Next.js 15 (App Router), TypeScript | Server components for menu/catalog, client components for cart/realtime |
| UI | Tailwind CSS, shadcn/ui | |
| Backend | FastAPI, Pydantic v2 | Async endpoints throughout |
| ORM / Migrations | SQLAlchemy 2.0 (async), Alembic | |
| Database | PostgreSQL | |
| Realtime | WebSockets | Per-station and per-order channels |
| Cache / Pub-Sub | Redis | Session state, WS fan-out, rate limiting |
| Auth | JWT (staff), short-lived session token (customer/table) | |

## 3. System Modules

### 3.1 Customer-Facing Flow
1. **Welcome** — QR scan lands here; table ID resolved from QR token
2. **Language Selection** — sets locale for session
3. **Dine-in / Takeaway** — determines table association and order routing
4. **Customer Details** — name/phone (optional, used for order lookup + notifications)
5. **Menu** — categorized, filterable, real-time item-availability aware
6. **Cart** — modifiers, quantity, special instructions
7. **Payment** — online (gateway) or "pay at counter" handoff to Cashier
8. **Thank You** — order confirmation + live status tracking link

### 3.2 Staff-Facing Flow
| Dashboard | Purpose | Consumes |
|---|---|---|
| Kitchen Dashboard | Order queue for hot-kitchen items | WS: `orders.new`, `orders.updated` |
| Naan Station | Sub-queue filtered to bread/tandoor items | WS: filtered by `category=bread` |
| Bar Station | Sub-queue filtered to beverages | WS: filtered by `category=beverage` |
| Cashier Dashboard | Payment collection, bill splitting, receipt printing | REST: `/orders`, `/payments` |
| Admin Dashboard | Menu management, staff accounts, analytics, inventory | REST: full CRUD across resources |

Station dashboards subscribe to the same order stream and filter client-side (or via server-side topic routing) by `order_items.category`, so a single order can fan out to multiple stations simultaneously.

## 4. Backend Structure

```text
backend/
  app/
    api/            # route handlers, versioned (v1/)
    models/         # SQLAlchemy ORM models
    schemas/        # Pydantic request/response schemas
    services/       # business logic (order routing, payment, inventory decrement)
    database/        # session/engine, base config
    core/           # settings, security, JWT, exception handlers
    ws/              # WebSocket connection manager, channel/topic logic
  alembic/           # migrations
  tests/
```

**Layering convention:** `api/` stays thin (validation + delegation only); all business logic lives in `services/`, so it's testable without spinning up HTTP.

## 5. Frontend Structure

```text
frontend/
  app/
    (customer)/      # welcome, menu, cart, payment, thank-you
    (staff)/         # kitchen, bar, cashier, admin — route-grouped, role-gated
  components/
    ui/              # shadcn primitives
    customer/
    staff/
  hooks/
    use-cart.ts
    use-order-socket.ts
  lib/
    api-client.ts
    ws-client.ts
    validators/
```

## 6. Data Model

| Table | Key Columns | Notes |
|---|---|---|
| `users` | id, name, phone/email, role_id, created_at | Staff accounts (customers are session-based, not persisted users unless they opt in) |
| `roles` | id, name (kitchen, bar, cashier, admin) | Drives dashboard access + WS topic subscriptions |
| `tables` | id, label, qr_token, status (free/occupied) | qr_token resolved on scan |
| `categories` | id, name, station (kitchen/bar/naan) | Drives station routing |
| `menu_items` | id, category_id, name, price, is_available, image_url | `is_available` toggled live from Admin/Inventory |
| `orders` | id, table_id, status, order_type (dine-in/takeaway), total, created_at | status: `placed → preparing → ready → served → paid` |
| `order_items` | id, order_id, menu_item_id, qty, modifiers, notes, item_status | item-level status lets Naan/Bar mark their piece done independently |
| `payments` | id, order_id, method, amount, status, transaction_ref | |
| `inventory` | id, menu_item_id, stock_qty, low_stock_threshold | Decrements on order confirm; flips `is_available` at zero |

## 7. Realtime Design

- **Connection manager** in `ws/` keeps a registry of active sockets keyed by `(role, station_id | table_id)`.
- **Events:** `order.created`, `order_item.status_changed`, `order.status_changed`, `payment.completed`, `menu_item.availability_changed`.
- Customer's Thank You page subscribes to its own `order.*` events for live status; staff dashboards subscribe to station-scoped topics.
- Redis pub/sub backs the fan-out so the WS layer can scale across multiple backend instances.

## 8. Auth & Roles

- **Staff:** JWT access + refresh token, role embedded in claims, route/dashboard access gated by role at both middleware and UI level.
- **Customer:** short-lived signed session token tied to `table_id`, issued on QR scan, expires when order is paid or session times out. No password; optional phone-based lookup for order history.

## 9. Development Phases

| Phase | Scope | Key Deliverables |
|---|---|---|
| 1. Backend & Auth | DB schema, Alembic migrations, JWT auth, role middleware | Working `/auth`, `/users` endpoints |
| 2. Customer Ordering | Menu, cart, order placement, payment intent, WS status updates | Full customer flow end-to-end |
| 3. Kitchen Dashboard | Order queue, station filtering, item-status updates | Kitchen + Naan + Bar dashboards live |
| 4. Cashier Dashboard | Bill view, payment settlement, receipt | Order → paid lifecycle closed |
| 5. Admin Panel | Menu CRUD, inventory, staff management, analytics | Full operational control |

## 10. Open Questions / To Decide

- Payment gateway choice (Stripe vs. local provider) — affects `payments.method` enum and webhook handling
- Whether customer accounts persist across visits or stay session-only
- Multi-branch/multi-location support now vs. later (affects `tables`/`users` scoping)

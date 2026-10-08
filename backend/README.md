# Backend

A single Go service for shop owners, chatbot automations and bank listeners. Echo
handles HTTP; pgx handles PostgreSQL; the `shop` package owns business rules shared
by all three entry points. No local Go installation is required.

## Run and test with Docker

From the repository root:

```sh
docker compose up --build backend
```

The backend runs at `http://localhost:8080`. `GET /health` checks database
connectivity. Compose provisions a **local development** shop with owner login
`99996666` / `admintest`. Provisioning is idempotent: restarting does not reset an
existing owner's password or configuration.

Run unit and PostgreSQL integration tests in a separate disposable database:

```sh
docker compose -p shop-backend-check -f compose.test.yaml up \
  --abort-on-container-exit --exit-code-from backend-test
docker compose -p shop-backend-check -f compose.test.yaml down
```

The tests cover tenant isolation, credential separation, cursor scope, half-open
time ranges, stock concurrency, payment retries, review resolution/reopening,
reports, and webhook retry/signatures. They never connect to the application DB.

To format Go code without installing Go:

```sh
docker compose -p shop-backend-check -f compose.test.yaml run \
  --rm --no-deps backend-test gofmt -w .
```

## Layout and persistence

- `internal/api`: HTTP decoding, authentication, response handling and route groups.
- `internal/shop`: typed models, queries and shared transactional business logic.
- `internal/store`: PostgreSQL access and embedded versioned SQL migrations.
- `internal/delivery`: durable outgoing webhook delivery.

Business tables have composite `(shop_id, id)` primary keys. Codes, external
transaction IDs and idempotency keys are unique **within a shop**. Sessions and
integration keys resolve a tenant on the server; callers cannot submit `shopId`.
Every entity lookup, mutation, list and report includes the authenticated shop ID.
Knowing another tenant's entity ID returns 404. Owner, chatbot and bank credentials
are separate; integration keys cannot call owner endpoints.

Products, orders, payments and review cases use separate relational tables with
typed JSONB documents for their API fields. Order items preserve purchased names
and prices even if a product is subsequently deleted. Expression indexes support
catalog, date and fulfillment queries; filtering and keyset pagination run in SQL.
This avoids a large ORM or generated repository layer. It is not an event store.

Mutations take a PostgreSQL transaction-scoped advisory lock per shop. Stock,
preorder counters, payment matching, reviews, idempotency and outgoing events commit
or roll back together. Different shops can mutate concurrently. Read transactions
use repeatable-read snapshots so a page and its count agree. This intentionally
serializes writes within a shop; high-volume shops may eventually need finer row
locking. Pages across separate requests reflect live data, not an export snapshot.

Schema migration takes a database advisory lock. Ordered SQL files in
`internal/store/migrations` run once; checksums reject edits to applied migrations.
Add a new migration file for subsequent production schema changes. Tenant isolation is explicit in SQL and tested; PostgreSQL RLS is not
currently enabled. Use a dedicated application DB role and protect DB credentials.

## API surfaces

See [`docs/api/openapi.yaml`](../docs/api/openapi.yaml) for the full contract.

| Caller | Routes | Credentials |
| --- | --- | --- |
| Shop-owner frontend | `/auth`, `/dashboard`, `/products`, `/orders`, `/reports`, `/review`, `/settings`, `/integrations`, `/uploads` | Owner session Bearer token |
| Make / Zapier chatbot | `/chatbot/products`, `/chatbot/settings`, `/chatbot/orders` | Chatbot Bearer service key |
| Bank transaction listener | `POST /bank/transactions` | Bank Bearer service key |
| Compatibility listener URL | `POST /hooks/sms/{listenerId}` | Bank Bearer key or `X-Listener-Token` |
| Public images | `GET /media/{id}` | Unguessable public URL |

List time ranges use RFC 3339 offsets, inclusive `from`, exclusive `to`. The owner
frontend still needs migration from date-only queries and array responses to this
contract. All unbounded owner lists paginate with `limit` and opaque `cursor`.
`nextCursor: null` ends traversal; exports must fetch all pages with unchanged
filters and limit. Products and preorder overviews do not require time filters.
Reports aggregate all matches independently of list pagination.

Direct Meta OAuth is **not implemented**: those deprecated compatibility routes
return 501. Make/Zapier owns the Meta connection. The integrations summary shows
`chatbot.connected`; the legacy Facebook/Instagram entries remain disconnected.

## Chatbot → backend

1. Look up a product: `GET /chatbot/products?q=TOS&limit=50`.
2. Fetch payment instructions: `GET /chatbot/settings`.
3. Create an order using the product ID and a stable `Idempotency-Key` header:

```http
POST /chatbot/orders
Authorization: Bearer <shop-chatbot-key>
Idempotency-Key: messenger-conversation-123-order-1
Content-Type: application/json
```

```json
{
  "customerName": "Buyer",
  "channel": "messenger",
  "conversationId": "messenger-conversation-123",
  "items": [{ "productId": "product-id", "variantName": null, "quantity": 2 }]
}
```

The backend computes prices and totals, reserves stock and returns a four-digit
payment code. It refuses an order if the shop has no bank account, stock is
insufficient, or a preorder has closed/expired/reached its limit. Retries do not
reserve stock twice. Cancellation returns stock; restoration reserves it again.

Use `PATCH /chatbot/orders/{id}/delivery` for the buyer's `customerPhone` and
`deliveryAddress`. Chatbot order responses omit owner-only `sellerNote`.

## Bank listener → backend

The listener sends **normalized transaction JSON**, not raw text that the server
must guess how to parse. The same shape works at the compatibility SMS URL.

```http
POST /bank/transactions
Authorization: Bearer <shop-bank-key>
Content-Type: application/json
```

```json
{
  "externalId": "bank-stable-transaction-id",
  "amount": 87000,
  "senderName": "BOLDBAATAR G.",
  "note": "4827",
  "bank": "Khan Bank",
  "receivedAt": "2026-09-19T14:32:00+08:00",
  "rawMessage": "Original notification, if available"
}
```

`externalId` must stay unchanged on retries; use the bank's transaction ID. If a
listener only receives notifications, it must assign a stable ID once and reuse
it. Equal payload replays return the original 202 result. A changed payload under
the same ID returns 409. External IDs may repeat in different shops.

One exact unpaid order code plus the exact amount auto-matches. Ambiguous or
mismatched payments create a review case. Review suggestions are deliberately
conservative; manual resolution handles partial amounts, refunds and unrelated
income. The server records refund decisions; it does not move money at a bank.

## Backend → Make / Zapier

Configure a destination separately for each shop, authenticated as its owner:

```http
PUT /integrations/chatbot
Authorization: Bearer <owner-session>
Content-Type: application/json
```

```json
{ "url": "https://hook.example.com/your-flow", "secret": "at-least-32-random-characters-long" }
```

The destination must use HTTPS. Redirects and private-network destinations are
blocked. The secret is write-only in HTTP APIs; protect DB access/backups because
outbound delivery needs the original secret. Deleting the integration pauses
delivery and retains pending events; reconnecting can deliver that backlog.

Example delivery:

```json
{
  "id": "stable-event-id",
  "shopId": "shop-id",
  "type": "payment.matched",
  "createdAt": "2026-09-19T06:32:00Z",
  "data": {
    "conversationId": "messenger-conversation-123",
    "payment": { "id": "payment-id", "amount": 87000, "note": "4827" },
    "order": { "id": "order-id", "code": "4827", "status": "paid" }
  }
}
```

The example abbreviates payment/order fields. Private owner notes, raw bank
messages and review candidate internals are removed before webhook delivery.

| Event | Automation action |
| --- | --- |
| `payment.matched` | Confirm payment to `data.conversationId`; payment and order included |
| `payment.needs_review` | Payment and case need owner attention; do not confirm payment to a buyer |
| `payment.resolved_without_order` | Payment was classified without a matching order |
| `payment.reopened` | Previous resolution was undone; reconcile any previous notification |
| `buyer.contact_requested` | Send `data.message` to `data.conversationId` |
| `preorder.arrived` | Notify the paid buyer; one event per paid order, with product/order/conversation IDs |

Outgoing requests have:

- `Authorization: Bearer <configured secret>` for easy Make/Zapier verification.
- `X-Webhook-ID`: stable event ID; deduplicate before messaging a buyer.
- `X-Webhook-Timestamp`: current Unix seconds for this attempt.
- `X-Webhook-Signature`: `sha256=<hex HMAC-SHA256(secret, timestamp + "." + rawBody)>`.

For HMAC verification, use the exact raw request bytes and reject timestamps older
than five minutes. Return 2xx only after accepting the event. Delivery is at least
once: a crash after receiving a 2xx but before marking delivery may resend the same
ID. Retries use exponential backoff capped at about one hour. Events are retained;
there is no dead-letter UI or retention job yet. Multiple workers claim different
rows with `FOR UPDATE SKIP LOCKED`; delivery order is not guaranteed. Use the event
ID and fetch the current order when an automation needs current state.

Owner contact/preorder-arrival operations require a configured chatbot destination
and return 503 otherwise. `contact.sentAt` records enqueue time, not successful
message delivery. Stock/payment operations still work without a destination;
their events wait until that shop configures one.

## Tenant provisioning and configuration

The local Compose defaults are only for development. Deployments must supply
unique integration keys, an independent `CURSOR_SECRET` (at least 32 characters),
real `PUBLIC_URL`, explicit `CORS_ORIGINS`, and database credentials. Keep secrets
in your deployment secret store; do not commit production values.

Provision another tenant with the same backend image; no public signup or
platform-admin HTTP API is exposed:

```sh
docker compose run --rm \
  -e BOOTSTRAP_SHOP_ID=second-shop \
  -e BOOTSTRAP_SHOP_NAME='Second shop' \
  -e BOOTSTRAP_OWNER_NAME='Second owner' \
  -e BOOTSTRAP_PHONE=88887777 \
  -e BOOTSTRAP_PASSWORD \
  -e BOOTSTRAP_CHATBOT_KEY \
  -e BOOTSTRAP_BANK_KEY \
  backend /server provision
```

Export those three secret values in your shell first. Chatbot and bank keys must
be distinct and at least 32 characters. Existing owners are not overwritten;
service credentials are stored only as SHA-256 hashes. The integrations API cannot
recover a bank key and returns an empty legacy `sms.token` field. Operator-managed
key rotation currently requires replacing its hashed `service_keys` entry in a
transaction; a self-service rotation endpoint is future work.

Optional `BOOTSTRAP_WEBHOOK_URL` / `BOOTSTRAP_WEBHOOK_SECRET` configure the first
chatbot destination. `BOOTSTRAP_SMS_URL` / `BOOTSTRAP_SMS_SECRET` configure an SMS
sending automation, also per tenant, for password resets. SMS deliveries use event
`sms.password_reset` with `data.phone` and `data.code`; integrate your SMS provider
in that automation. Codes expire after ten minutes, allow five attempts and are
never returned by public HTTP APIs or logged. Successful delivery removes the code
from the outbox payload. Unconfigured/unknown accounts receive the same reset
request response; an SMS provider must be configured for usable reset delivery.

Passwords use bcrypt; opaque sessions expire after 30 days. Reset revokes all
sessions; password changes retain the calling session and revoke the others. Auth
requests are rate-limited per process/IP, and reset requests are also throttled per
phone in PostgreSQL. Use shared edge rate limits when running multiple instances.

Uploads are capped at 10 MiB, validated as JPEG/PNG/WebP/HEIC and stored in PostgreSQL
for this initial deployment. Public URLs are intended for product images. At larger
volume, move image bytes to object storage without changing the API shape.

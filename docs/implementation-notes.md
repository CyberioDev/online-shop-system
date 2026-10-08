# Implementation notes — SMS, lists, and Studio UI

This file consolidates the work added during this session. Existing repository
README files and the original API specification are preserved at their baseline.
The API extension patch at the end of this file records the new contract changes.

## Changes at a glance

- Added raw Khan Bank SMS ingestion, phone-token rotation, account validation,
  durable receipt storage, repeat-request handling, and payment reconciliation.
- Added a bank transactions screen and API, cursor pagination, date/time queries,
  search filters, and exports that fetch all matching pages.
- Retained existing demo data alongside real bank transactions.
- Preserved `app/` and created an independent redesigned `app-v2/` interface.
- Built a charcoal-and-mint design with burgundy warnings, amount-first transaction
  rows, expandable SMS details, responsive navigation, and a richer dashboard.

## Components and libraries

The app continues to use Expo SDK 57, React, React Native, React Native Web,
Expo Router, Inter fonts, and Feather icons. The backend uses Go, Echo v5, and
PostgreSQL. Docker Compose runs the local services. These were existing project
technologies; the redesign introduced no additional runtime library.

Web-only CSS provides the revenue-card gradient and decorative rings, hover
transitions, and keyboard focus outlines. Reduced-motion preferences disable
transitions. Native rendering keeps a solid revenue-card background.

## Pagination and date/time API

Owner-authenticated GET `/products`, `/orders`, `/orders/search`, `/transactions`,
and `/review/cases` return a cursor page with `total` and `nextCursor`.

- `limit`: 1–200; default 50. The interfaces request 25 items per page.
- `cursor`: use the returned cursor with the same filters and limit.
- `from`: optional inclusive RFC3339 instant with timezone.
- `to`: optional exclusive RFC3339 instant with timezone; later than `from`.
- Products and orders filter `createdAt`; transactions and review filter `receivedAt`.
- Products accept `q` (name/code) and `saleType` (`stock` or `preorder`).
- Transactions accept `q` (note/sender) and include matched and unmatched payments.
- Order views include `all`, `awaiting_payment`, `needs_review`, `to_fulfill`,
  `fulfilled`, and `cancelled`. Reports still require both bounds.
- Cursors are bound to the shop and query; do not reuse across filters.

The UI includes **Нийт**, **Сүүлийн 1 цаг**, **Сүүлийн 4 цаг**, **Өнөөдөр**,
**Сүүлийн 7 хоног**, and **Өөр хугацаа**. Custom ranges use separate start/end
calendar popups with optional times in UTC+8. Today is a calendar day, not a rolling
24-hour preset. Refresh recalculates relative ranges. Excel exports fetch every
page matching the active filters.

## Demo records

Existing demo fixtures remain available alongside real SMS transactions. The seed
marker prevents duplicates on restart. Use `BOOTSTRAP_DEMO_DATA=false` for a
deployment that should not seed fixtures. No credentials or phone tokens are
included in this document.

## Cloudflare and local connectivity

Cloudflare Tunnel provided a temporary public HTTPS address that forwards to the
Mac's backend at `http://localhost:8080`. This lets the iPhone send requests over
mobile data without using the Mac's private LAN address or opening router ports.

```sh
cloudflared tunnel --url http://localhost:8080
```

Set `PUBLIC_URL` to the current tunnel's HTTPS origin when starting/recreating the
backend. Keep the Mac, backend, and tunnel running. A temporary tunnel URL can
change on restart; update the shortcut URL when it changes. Stable unattended
operation needs a stable public deployment or configured tunnel.

## Khan Bank SMS forwarding

The app's Settings → Integrations bank SMS card configures a phone-specific
credential. Create a token there and copy it immediately: only its hash is stored,
and it cannot be shown again after leaving the screen. Creating a replacement
revokes earlier phone credentials, while preserving operator bank API keys.

Set the shop's Khan Bank receiving account under Settings → Bank account. The
observed SMS account mask must match this account's visible digits. IBANs whose
representation differs from the bank SMS account mask need an explicit mapping
before automatic matching; currently they are retained as account mismatches.

### Public address

The phone needs a public HTTPS backend address for mobile data. Set `PUBLIC_URL`
to that address and rebuild the backend; the integration card uses it to construct
its webhook URL. `localhost` is not the Mac when used on an iPhone. A temporary Cloudflare Tunnel was used during local setup; its current URL must be taken from the running tunnel, not hardcoded from an earlier session. Keep production credentials private and
use a stable deployment for unattended forwarding.

### iPhone shortcut

1. Create a Message automation for sender **131917**, with **Run Immediately**.
2. Extract the incoming message body from **Shortcut Input** using **Get Text from
   Input**. Do not use the sender or a notification title as the message body.
3. Create an event ID once: use **Current Date**, **Format Date** (custom
   `yyyyMMddHHmmssSSS`), **Random Number** (100000000–999999999), and **Text** to join
   them with a hyphen. Store that ID with the message before making the request.
4. **Get Contents of URL**: use the webhook URL ending in `/raw`, method **POST**,
   header `X-Listener-Token` = the newly created token, Request Body **JSON**:
   - `id`: the stored event ID.
   - `sender`: literal text `131917`.
   - `message`: the incoming SMS body.
   - `receivedAt`: optional ISO 8601 date with timezone; otherwise the server uses
     the first successful receipt time.
5. Save the shortcut and ensure the automation runs immediately. Permit network access when iOS requests it. In the app, check **Сүүлд хүлээн авсан** for receipt activity. A 202 response means the receipt was saved, not necessarily that an order was marked paid.

For reliable manual resends, use a Dictionary containing the fields above and
**Save File** before the HTTP request. Choose a local On My iPhone outbox folder
and filename based on the event ID. Keep failed requests there; a resend shortcut
must load the saved JSON and send it unchanged. Remove a file only after a 202
response. Shortcuts does not automatically provide an offline retry queue. If a
second forwarding run generates a new ID, the backend cannot prove it is the same
bank transaction, because this SMS format contains no bank transaction ID.

### Server behavior

`POST /hooks/sms/{listenerId}/raw` authenticates the shop through the key and
checks the URL listener ID. Retries with the same ID and message return the stored
result. Reusing that ID with different message content returns 409.

The parser currently supports the supplied `Khan Bank:Tany … ORLOGO:…MNT …
ULDEGDEL:…MNT … Utga:…` incoming-transfer format with whole MNT amounts (optional
`.00`). It preserves the original note and text, and does not infer sender names.
Only the transaction note is searched for an order code; account and balance
numbers are never used as order codes.

- Exact unpaid order code and amount: existing matching marks it paid.
- Parsed income without a code or with an amount mismatch: existing **Шалгах** inbox.
- Unknown format, unsupported fractional amount, missing/wrong receiving account:
  saved in PostgreSQL and shown in the integration card's **Уншиж чадаагүй SMS** list
  (20 latest). These are not counted as payments. A reprocessing/resolution UI for
  these raw receipts is not implemented yet.

The supplied sender is a filter, not independent verification by the bank. These
are phone-reported notifications, not a direct Khan Bank API connection.

The existing `/bank/transactions` and `/hooks/sms/{listenerId}` normalized JSON
APIs keep their original behavior. Raw SMS has a separate `/raw` route.

## Redesigned interface (app-v2)

An independent redesigned copy of `../app`. The original UI is preserved.

- Original: http://localhost:8081
- Studio: http://localhost:8082
- Shared backend: http://localhost:8080

Both interfaces use the same backend and shop records. Changes to orders, products,
settings or payments in either interface affect the same database.

### Local development

From `app-v2/`:

```sh
npm ci
EXPO_PUBLIC_API_URL=http://localhost:8080 npm run web
```

This checkout currently links to the original app's installed node_modules;
`npm ci` installs an independent dependency tree when needed.
The backend must allow `http://localhost:8082` in `CORS_ORIGINS`.

### Run both interfaces with Docker

From the repository root (stop the local v2 development server first):

```sh
docker compose -f compose.yaml -f compose.studio.yaml up --build -d
```

Preserve your configured `PUBLIC_URL` when recreating the backend if using a tunnel.

### Validation

```sh
npm run lint
npx tsc --noEmit
npm run build:web
```

The static web export is written to `dist/`. Production hosting needs an HTTPS API
URL configured at build time, matching backend CORS, and an SPA fallback for routes.
Native iOS and Android builds require separate device validation.

### Design

Charcoal and white surfaces with mint actions and restrained burgundy attention states, Inter typography, responsive sidebar and scrollable phone
navigation, a data-backed overview, grouped recent orders, channel summaries, and
expandable SMS details. Existing API integration, pagination, independent calendar
pickers, account settings, payment review and product editing are retained.
No additional runtime libraries were introduced.

## Final interface details and verification

The v2 dashboard shows today's revenue, paid/awaiting/review counts, recent orders,
seven-day channel totals, and bank listener activity. Its seven-day revenue bars
use seven daily report requests; no trend data is fabricated. This adds seven
requests per dashboard refresh. Order, product, review, settings, and integration
workflows retain the same API and database as the original UI.

Transactions show the amount first, then description, date, and bank. The raw SMS
appears on expansion. Warning cards use a rose tint, dark burgundy text/badges,
and a stronger accent edge. Light/dark theme preference is separate for Studio.

TypeScript, lint, and static web export passed during implementation. Desktop web
and responsive layouts were inspected. Native builds and production hosting
require their own validation. No public production deployment was performed.

## API specification extensions

The baseline `docs/api/openapi.yaml` remains unchanged. The patch below consolidates
its session additions here, including raw SMS request/response shapes, token
rotation, transactions, optional time bounds, and updated order views.

```diff
diff --git a/docs/api/openapi.yaml b/docs/api/openapi.yaml
index 77d7618..ee9c299 100644
--- a/docs/api/openapi.yaml
+++ b/docs/api/openapi.yaml
@@ -191,8 +191,17 @@ paths:
       tags: [Products]
       summary: List the shop's products
       parameters:
+        - $ref: '#/components/parameters/OptionalFrom'
+        - $ref: '#/components/parameters/OptionalTo'
         - $ref: '#/components/parameters/Cursor'
         - $ref: '#/components/parameters/Limit'
+        - name: q
+          in: query
+          schema: { type: string, maxLength: 200 }
+        - name: saleType
+          in: query
+          schema: { type: string, enum: [stock, preorder] }
+      description: Filters product createdAt; q searches name/code and saleType filters stock/preorder.
       responses:
         '200':
           description: OK, sorted by code ascending, then ID ascending
@@ -300,6 +309,8 @@ paths:
         Pagination applies only to orders, sorted by createdAt descending then ID descending.
         Product counters and tally cover all orders for this product across all pages.
       parameters:
+        - $ref: '#/components/parameters/OptionalFrom'
+        - $ref: '#/components/parameters/OptionalTo'
         - $ref: '#/components/parameters/Cursor'
         - $ref: '#/components/parameters/Limit'
       responses:
@@ -376,6 +387,30 @@ paths:
         '401': { $ref: '#/components/responses/Unauthorized' }
         '422': { $ref: '#/components/responses/Validation' }

+  /transactions:
+    get:
+      operationId: listTransactions
+      tags: [Review]
+      summary: Paginated bank transactions, newest receivedAt first
+      description: Includes matched and unmatched payments. Uses owner authentication. Invalid raw SMS receipts are not payments.
+      parameters:
+        - $ref: '#/components/parameters/OptionalFrom'
+        - $ref: '#/components/parameters/OptionalTo'
+        - $ref: '#/components/parameters/Cursor'
+        - $ref: '#/components/parameters/Limit'
+        - name: q
+          in: query
+          description: Search transaction note or sender name.
+          schema: { type: string, maxLength: 200 }
+      responses:
+        '200':
+          description: Payment page
+          content:
+            application/json:
+              schema: { $ref: '#/components/schemas/TransactionPage' }
+        '401': { $ref: '#/components/responses/Unauthorized' }
+        '422': { $ref: '#/components/responses/Validation' }
+
   /orders:
     get:
       operationId: listOrders
@@ -384,8 +419,8 @@ paths:
       parameters:
         - $ref: '#/components/parameters/Cursor'
         - $ref: '#/components/parameters/Limit'
-        - $ref: '#/components/parameters/From'
-        - $ref: '#/components/parameters/To'
+        - $ref: '#/components/parameters/OptionalFrom'
+        - $ref: '#/components/parameters/OptionalTo'
       description: |
         Filters Order.createdAt. Sorted by createdAt ascending, then ID ascending.
         For Excel/CSV export, fetch every page until nextCursor is null.
@@ -402,10 +437,10 @@ paths:
     get:
       tags: [Orders & reports]
       operationId: searchOrders
-      summary: Confirmed-order list for the Захиалга tab
+      summary: All order statuses for the Захиалга tab
       parameters:
-        - $ref: '#/components/parameters/From'
-        - $ref: '#/components/parameters/To'
+        - $ref: '#/components/parameters/OptionalFrom'
+        - $ref: '#/components/parameters/OptionalTo'
         - $ref: '#/components/parameters/Cursor'
         - $ref: '#/components/parameters/Limit'
         - name: view
@@ -588,8 +623,8 @@ paths:
         There is no implicit seven-day cutoff. Sorted by payment.receivedAt descending,
         then case ID descending. The global badge remains available via /review/summary.
       parameters:
-        - $ref: '#/components/parameters/From'
-        - $ref: '#/components/parameters/To'
+        - $ref: '#/components/parameters/OptionalFrom'
+        - $ref: '#/components/parameters/OptionalTo'
         - $ref: '#/components/parameters/Cursor'
         - $ref: '#/components/parameters/Limit'
       responses:
@@ -857,6 +892,77 @@ paths:
             application/json:
               schema: { $ref: '#/components/schemas/Error' }

+  /integrations/sms/rotate:
+    post:
+      operationId: rotateSmsToken
+      tags: [Integrations]
+      summary: Create or rotate a phone listener credential
+      description: Revokes previous phone listener keys, preserves operator bank keys, and returns the new token once.
+      responses:
+        '200':
+          description: New listener credentials; keep the token private.
+          content:
+            application/json:
+              schema:
+                type: object
+                required: [token, webhookUrl]
+                properties:
+                  token: { type: string }
+                  webhookUrl: { type: string }
+        '401': { $ref: '#/components/responses/Unauthorized' }
+
+  /hooks/sms/{listenerId}/raw:
+    post:
+      operationId: receiveRawBankSms
+      tags: [Bank listener]
+      summary: Capture a Khan Bank SMS and reconcile its incoming payment
+      description: |
+        Send a stable id generated once on the phone; reuse it with the same message on retries.
+        The first receipt fixes receivedAt. Unknown formats, fractional amounts and account
+        mismatches are preserved as needs_review receipts in the integrations screen.
+        Parsed transactions reuse the normal order matching and payment review flow.
+      security:
+        - listenerAuth: []
+        - bankAuth: []
+      parameters:
+        - name: listenerId
+          in: path
+          required: true
+          schema: { type: string }
+      requestBody:
+        required: true
+        content:
+          application/json:
+            schema:
+              type: object
+              additionalProperties: false
+              required: [id, sender, message]
+              properties:
+                id: { type: string, minLength: 1, maxLength: 200 }
+                sender: { type: string, enum: ['131917'] }
+                message: { type: string, minLength: 1, maxLength: 10000 }
+                receivedAt: { type: string, format: date-time }
+      responses:
+        '202':
+          description: Receipt saved; inspect status and result before treating a payment as matched.
+          content:
+            application/json:
+              schema:
+                type: object
+                required: [id, status, reason, result]
+                properties:
+                  id: { type: string }
+                  status: { type: string, enum: [processed, needs_review] }
+                  reason: { type: string }
+                  result:
+                    nullable: true
+                    allOf:
+                      - $ref: '#/components/schemas/PaymentResult'
+        '401': { $ref: '#/components/responses/Unauthorized' }
+        '404': { $ref: '#/components/responses/NotFound' }
+        '409': { $ref: '#/components/responses/Conflict' }
+        '422': { $ref: '#/components/responses/Validation' }
+
   /hooks/sms/{listenerId}:
     post:
       operationId: receiveBankSms
@@ -1159,6 +1265,16 @@ components:
       description: Exclusive end instant; must be later than `from`.
       schema: { type: string, format: date-time }
       example: '2026-09-20T00:00:00+08:00'
+    OptionalFrom:
+      name: from
+      in: query
+      description: Optional inclusive RFC3339 instant with timezone. Omit for no lower bound.
+      schema: { type: string, format: date-time }
+    OptionalTo:
+      name: to
+      in: query
+      description: Optional exclusive RFC3339 instant with timezone. Must be after from when both are supplied.
+      schema: { type: string, format: date-time }
     Cursor:
       name: cursor
       in: query
@@ -1479,9 +1595,9 @@ components:

     OrderView:
       type: string
-      enum: [to_fulfill, fulfilled, cancelled]
+      enum: [all, awaiting_payment, needs_review, to_fulfill, fulfilled, cancelled]
       description: |
-        `to_fulfill` = paid, not delivered (oldest payment first); `fulfilled` = paid and delivered
+        `all`, `awaiting_payment`, `needs_review` = newest creation first; `to_fulfill` = paid, not delivered (oldest payment first); `fulfilled` = paid and delivered
         (newest delivery first); `cancelled` (newest cancelledAt first).

     NextCursor:
@@ -1490,6 +1606,16 @@ components:
       minLength: 1
       description: Pass as cursor for the next page with the same filters and limit; null on the last page.

+    TransactionPage:
+      type: object
+      required: [transactions, total, nextCursor]
+      properties:
+        transactions:
+          type: array
+          items: { $ref: '#/components/schemas/BankPayment' }
+        total: { type: integer, minimum: 0 }
+        nextCursor: { $ref: '#/components/schemas/NextCursor' }
+
     ProductPage:
       type: object
       required: [products, total, nextCursor]
@@ -1811,10 +1937,21 @@ components:
       required: [connected, webhookUrl, token, senderNumber, deviceLabel, lastReceivedAt]
       properties:
         connected: { type: boolean }
-        webhookUrl: { type: string, format: uri, description: 'Full URL of `POST /hooks/sms/{listenerId}`.' }
-        token: { type: string, description: Empty string; service credentials are returned only during operator provisioning and are not recoverable through this API. }
+        webhookUrl: { type: string, format: uri, description: 'Full URL of `POST /hooks/sms/{listenerId}/raw`.' }
+        token: { type: string, description: Empty string; phone credentials are returned once by POST /integrations/sms/rotate and cannot be recovered. }
         senderNumber: { type: string, nullable: true, description: Bank SMS sender being forwarded. }
         deviceLabel: { type: string, nullable: true }
+        failures:
+          type: array
+          maxItems: 20
+          items:
+            type: object
+            required: [id, message, receivedAt, reason]
+            properties:
+              id: { type: string }
+              message: { type: string }
+              receivedAt: { type: string, format: date-time }
+              reason: { type: string }
         lastReceivedAt:
           type: string
           nullable: true
```

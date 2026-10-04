# Backend integration guide

For whoever builds the Go + PostgreSQL backend that the Tulgagch app talks to. The
frontend is finished against an in-memory mock; this document and the OpenAPI spec
describe exactly what it expects from a real server.

| What | Where |
| --- | --- |
| API contract (OpenAPI 3.0.3) | [`docs/api/openapi.yaml`](api/openapi.yaml) |
| Same types in TypeScript | [`app/src/api/types.ts`](../app/src/api/types.ts) |
| HTTP client the app uses | [`app/src/api/http.ts`](../app/src/api/http.ts) |
| Reference behaviour (mock server) | [`app/src/api/mock.ts`](../app/src/api/mock.ts), [`app/src/api/mock-review.ts`](../app/src/api/mock-review.ts) |

The spec is OpenAPI **3.0.3** (not 3.1) on purpose, so Go generators work. It already
compiles with [oapi-codegen](https://github.com/oapi-codegen/oapi-codegen) into a
`ServerInterface` with one method per `operationId`:

```sh
go run github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen@latest \
  -generate types,std-http-server -package api \
  -o backend/internal/api/api.gen.go docs/api/openapi.yaml
```

Using a generator is optional; the JSON on the wire is what matters.

---

## 1. Running the app against your backend

The app picks its data source at build time from `EXPO_PUBLIC_API_URL`:

- **Unset/empty** → demo mode (mock data, temporary test login `99996666` / `admintest`).
- **Set** → every call goes to that URL via `http.ts`. The demo test-account hint disappears.

```sh
# Docker (from the repo root)
EXPO_PUBLIC_API_URL=http://localhost:8080 docker compose up --build frontend backend

# Or locally (app/)
cp .env.example .env.local     # set EXPO_PUBLIC_API_URL=http://localhost:8080
npx expo start --clear         # --clear is required after changing the variable
```

Metro caches inlined `EXPO_PUBLIC_*` values, so **restart with `--clear`** whenever the
URL changes. The URL is used by the browser or phone, not by containers: use
`http://localhost:8080` for web and iOS simulator, `http://10.0.2.2:8080` for the
Android emulator, and your computer's LAN IP for a physical phone.

**CORS.** In development the web app runs on `http://localhost:8081` and calls `:8080`,
so the backend must answer preflight requests:

```
Access-Control-Allow-Origin: http://localhost:8081   (plus the production web origin)
Access-Control-Allow-Headers: Authorization, Content-Type
Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
```

Phones (native) don't need CORS.

## 2. Conventions

- **JSON keys are camelCase** (`customerName`, `paidAt`). Go structs need explicit tags.
- **Every field in the schema is always present.** Send `null` for empty optional values;
  don't omit them (avoid `omitempty`).
- **Arrays are never `null`.** A nil Go slice marshals to `null` and breaks the UI, so
  initialise with `[]T{}`.
- **IDs are opaque strings.** UUIDs or prefixed IDs both work; the app never parses them.
- **Money is an integer number of tögrög** (`87000`). Never float, never string. Use
  `bigint` in Postgres.
- **Timestamps are RFC 3339 with offset** (`time.Time` default JSON is fine).
- **Calendar days are `YYYY-MM-DD` in `Asia/Ulaanbaatar`.** `from`/`to` are inclusive.
  "Today" on the dashboard is today in Ulaanbaatar, not UTC: compute day boundaries with
  `time.LoadLocation("Asia/Ulaanbaatar")`.
- **Codes are strings**: product codes `"154"` (3 digits), order codes `"4827"` (4 digits).
  Keep leading zeros if you ever allow them.

### Auth

- `POST /auth/login` returns `{ token, user }`; the app stores the token (SecureStore on
  phones, localStorage on web) and sends `Authorization: Bearer <token>` on every call.
- Any **401 on a call other than login** signs the user out and shows "session expired".
  Use it for expired or revoked tokens only, not for permission errors.
- One user belongs to one shop. Every query must be scoped to the token's shop; a
  resource from another shop is a `404`.

### Errors

Non-2xx responses carry this envelope (the app also falls back to the status code):

```json
{ "error": { "code": "code_taken", "message": "Энэ код өөр бараанд ашиглагдсан байна." } }
```

| Status | `code` | App behaviour |
| --- | --- | --- |
| 401 (login) | `invalid_credentials` | "wrong phone or password" |
| 401 | `unauthorized` | signs out |
| 404 | `not_found` | generic "not found" |
| 409 | `code_taken` | inline error on the product code field |
| 409 | `conflict` | shows `message` (e.g. case already resolved) |
| 400/422 | `validation` | shows `message` |

`message` for `validation` and `conflict` is **shown to the seller verbatim, so write it in
Mongolian**. For other codes the app uses its own text.

The client times out after 20 s (60 s for image upload).

## 3. Screens → endpoints

| Screen | Calls |
| --- | --- |
| Login | `POST /auth/login` |
| Өнөөдөр (home) | `GET /dashboard/today` |
| Tab bar badge | `GET /review/summary` (on every navigation; keep it cheap) |
| Шалгах inbox | `GET /review/cases`, `POST /review/cases/{id}/refunded` |
| Шалгах case | `GET /review/cases/{id}`, `GET …/candidates?q=`, `POST …/resolve`, `POST …/contact`, `POST …/reopen` |
| Бараа list | `GET /products`, `PATCH /products/{id}` (inline price) |
| Product form | `GET /products/{id}`, `POST /uploads/images`, `POST /products`, `PUT /products/{id}`, `DELETE /products/{id}` |
| Тайлан | `GET /reports/summary?from&to`, `GET /orders?from&to` (Excel/CSV is built in the app) |
| Холболт | `GET /integrations`, `POST /integrations/meta/{platform}/connect`, `DELETE /integrations/meta/{platform}` |
| Logout | `POST /auth/logout` |

## 4. Business rules the UI relies on

### Products

- `code` is 3 digits and **unique per shop**. The seller either types one or lets the
  server pick (`code: null` in the request):
  - typed → `codeSource: "custom"`; return `409 code_taken` if another product uses it;
  - `null` on a product whose code is already `auto` → **keep** that code;
  - `null` on a new product or one with a `custom` code → generate an unused code in
    100–999, `codeSource: "auto"` (this is how a seller reverts to a system code).
- `variants` is the size/type breakdown (`"S"`, `"38"`, `"Хар"`). Names are unique within
  a product (case-insensitive). On `PUT`, match variants by name to keep their IDs. When
  `variants` is empty, `stock` is the quantity; otherwise `stock` is 0.
- Images: the app uploads a newly picked image to `POST /uploads/images` (multipart,
  field `file`) and saves the returned URL in `imageUrl`. That URL must load in a plain
  `<img>`/`Image` **without auth headers** (public bucket, CDN or signed long-lived URL).
- Deleting a product must not break old orders: `OrderItem` copies `productName` and
  `unitPrice` at order time.

### Orders (created by the chatbot)

The flow the app's data reflects:

1. A buyer sees a listing and messages the shop's Facebook page or Instagram with the
   product code and size, e.g. `423 5XL` or `521 38`. Live-selling comments work the same
   way (`channel: "live"`).
2. The chatbot replies with the product name, price and the available sizes/types. If the
   size is missing or ambiguous it asks for it.
3. When the order is complete it creates an `Order` with a **4-digit purchase `code`**,
   unique among the shop's unpaid orders. It tells the buyer the total, the bank account,
   and to put the code in the transfer description (`Гүйлгээний утга`).
4. Status: `awaiting_payment` → `paid` (`matchedBy: "auto"` or `"manual"`, `paidAt` = when
   the money arrived). `needs_review` means a payment that probably belongs to this order
   is waiting in an open review case.

Store the Messenger/Instagram conversation (PSID / IGSID) on each order. The app's
**"message the buyer"** action (`POST /review/cases/{id}/contact`) sends into that
conversation. Return `422` with a Mongolian `message` if the order has none.

### Payments and automatic matching

Bank SMS arrive at `POST /hooks/sms/{listenerId}` (see §5). For each one:

1. Parse amount, sender name and transaction note into a `BankPayment`; keep the raw text
   in `rawMessage`. The sample SMS format in the mock is illustrative only, so collect
   real Khan Bank samples before writing the parser.
2. **Auto-match** when the note contains the 4-digit code of exactly one unpaid order of
   the shop **and** the amount equals its total. Set the order to `paid`,
   `matchedBy: "auto"`, and have the chatbot confirm to the buyer.
3. Otherwise create a **review case** with a `reason`:

| `reason` | When |
| --- | --- |
| `code_typo` | a 4-digit code in the note is one digit off, or two adjacent digits are swapped, from an unpaid order's code (`4872` vs `4827`) |
| `amount_mismatch` | the code matches an unpaid order but the amount differs |
| `duplicate` | the code matches an order that is already paid |
| `no_code` | no usable code in the note |

   Set `suggestion` when there is one confident order (the code-based cases above) and mark
   that order `needs_review`. Fill `candidates` with up to 4 other plausible unpaid orders.

**Match signals.** Each `MatchCandidate` carries `signals` (✓/!/✗ lines shown as "Яагаад
таарч байна") and a short `summary`. The app only displays them; the server computes them.
The mock's `evaluate()` in [`mock-review.ts`](../app/src/api/mock-review.ts) is the
reference: amount equality, sender-name similarity (bank names are uppercase, often
"НЭР О." or "О. НЭР"), minutes between order and payment, code exact/near/missing/other,
and already-paid. Keep the Mongolian texts and the `"label: detail"` shape (the part after
`": "` is shown bold).

### Review case lifecycle

```
open ──contact──▶ waiting_buyer
 │                    │
 └──────resolve───────┴──▶ resolved ──reopen──▶ open / waiting_buyer
```

- **resolve `matched`**: the order becomes `paid`, `matchedBy: "manual"`,
  `paidAt = payment.receivedAt`. `difference = payment.amount − order.total`.
  - `> 0` → `differenceAction` must be `refund` (creates `refund: {amount: difference, status: pending}`) or `keep`.
  - `< 0` → must be `accept_short` (when the seller asks for the rest instead, the app calls `contact` and the case waits).
  - `= 0` → must be `null`.
  - Matching an already-paid order → `409 conflict`.
- **resolve `no_order`**: `category: refund` creates a refund of the full amount;
  `other_income` keeps the money but excludes it from sales.
- In both cases, an order that was marked `needs_review` for this case and was **not** the
  one matched goes back to `awaiting_payment`.
- **contact**: send the message and store it in `contact`. An `open` case becomes `waiting_buyer`.
- **refunded**: the seller transferred the money back by hand; set `refund.status: done`, `doneAt`.
- **reopen**: restore every order the resolution changed, clear `resolution` and `refund`,
  and go back to `waiting_buyer` if `contact` is set, else `open`. Refuse with `409` once
  the refund is `done`. Record what the resolution changed so it can be undone.
- Resolving or reopening a case that changed meanwhile → `409 conflict` with a Mongolian
  message. Use a row lock or version column; two people may review at once.
- `GET /review/cases` returns `open` and `waiting_buyer` cases plus `resolved` ones from
  the last 7 days. `GET /review/summary` counts open, waiting and pending refunds.

### Dashboard and report numbers

These match the mock, which is what the UI was designed around:

- `revenue` = sum of `total` of **paid** orders **created** in the range. `paidCount` and
  `awaitingCount` count orders created in the range.
- `TodaySummary.reviewCount` = all `open` review cases (any date). `recent` = up to 10
  orders by latest event (`paidAt ?? createdAt`), newest first.
- `byChannel` = paid orders per channel. `topProducts` = top 5 by revenue from paid order items.
- `unmatchedPaymentCount` = payments received in the range that are unresolved or resolved as `no_order`.
- `GET /orders` returns every order created in the range, oldest first. It feeds the
  Excel/CSV export, so it is not paginated; a month is a few thousand rows at most.

## 5. Integrations

### Bank SMS listener

The shop's phone forwards bank SMS from one sender to the backend:

- **iPhone**: Shortcuts automation (Message from sender → Get Contents of URL).
- **Android**: an SMS-forwarding app.

The Холболт tab shows the values to configure (`Integrations.sms`):

- `webhookUrl`: full URL of `POST /hooks/sms/{listenerId}`, one per shop;
- `token`: secret the phone sends in `X-Listener-Token`;
- `senderNumber`, `deviceLabel`, `lastReceivedAt`: status shown to the seller.

The body is the raw SMS as `text/plain`. Respond `202` quickly and process async. Phones
retry, so **de-duplicate** identical messages within a short window. Update
`lastReceivedAt` on every valid call.

### Meta (Facebook page / Instagram)

OAuth with a redirect back to the app:

1. The app calls `POST /integrations/meta/{platform}/connect` with `returnUrl`:
   `http://localhost:8081/integrations` on web, `tulgagch://integrations` on phones
   (app scheme set in `app/app.json`).
2. The backend returns `{ authUrl }` (Meta's consent URL with your `state`). Allow-list
   `returnUrl` origins/schemes and bind them to the `state`.
3. The app opens `authUrl` in a browser auth session. Meta redirects to
   `GET /integrations/meta/callback`; the backend exchanges the code, stores the page
   token, then `302`s to `returnUrl?meta=connected` (or `?meta=error`).
4. The app closes the browser and refetches `GET /integrations`.

The onboarding team does this on-site with the shop owner. Meta webhooks (messages,
comments) that feed the chatbot are backend-only and not part of this contract.

## 6. Demo-only pieces to remove later

- `TEST_ACCOUNT` in `app/src/constants/config.ts` and the card marked `TEMPORARY` in
  `app/src/app/login.tsx`. The card is already hidden when `EXPO_PUBLIC_API_URL` is set.
- The mock itself (`mock*.ts`) can stay for UI work and demos.

## 7. Open decisions for the backend

- **Stock**: when to decrement (on order creation, or on payment) and what the chatbot
  says when a size is sold out. The app only displays `quantity`/`stock`.
- **Unpaid order expiry**: how long an `awaiting_payment` order stays matchable, and
  whether its code can be reused afterwards.
- **Order code space**: 4 digits allow 9,000 unpaid orders per shop at once, plenty, but
  avoid codes one digit away from another open order's code to reduce `code_typo` cases.
- **Multiple banks**: the contract has `BankPayment.bank`; the listener currently assumes one sender.

## 8. Changing the contract

Change these three together in the same PR, and update the mock so demo mode keeps working:

1. `docs/api/openapi.yaml`
2. `app/src/api/types.ts`
3. `app/src/api/http.ts` (paths)

Lint the spec with `npx @redocly/cli lint docs/api/openapi.yaml`.

/**
 * Domain types shared by the mock and HTTP API clients. These describe the
 * contract the Go backend is expected to serve; keep them in sync with
 * docs/api/openapi.yaml (see docs/backend-integration.md).
 *
 * - JSON keys are camelCase. IDs are opaque strings.
 * - Money is an integer number of tögrög (MNT), never a float or string.
 * - Dates in requests are calendar days `YYYY-MM-DD` in Asia/Ulaanbaatar (inclusive ranges).
 * - Timestamps in responses are RFC 3339 / ISO 8601 strings.
 */

export type User = {
  id: string;
  /** Owner's display name, used in the greeting. */
  name: string;
  shopName: string;
  /** 8-digit Mongolian number without the +976 prefix. */
  phone: string;
};

export type Session = {
  token: string;
  user: User;
};

// ---------- Products ----------

export type ProductVariant = {
  id: string;
  /** Free-form breakdown label, e.g. "L", "38", "Хар". */
  name: string;
  quantity: number;
};

/**
 * `stock`: goods on hand, sold from `stock` / variant quantities.
 * `preorder`: goods ordered from abroad in bulk after buyers order; no stock is tracked.
 */
export type SaleType = 'stock' | 'preorder';

/**
 * Preorder lifecycle: `open` (chatbot takes orders) → `closed` (seller placed the bulk
 * order; chatbot stops taking orders) → `arrived` (goods are in; buyers are notified).
 * `closed` can go back to `open`; `arrived` is final.
 */
export type PreorderStatus = 'open' | 'closed' | 'arrived';

/** What the seller sets for a preorder. */
export type PreorderSettings = {
  /** Last day to order (`YYYY-MM-DD`, Ulaanbaatar), inclusive; null = until closed by hand. */
  closesOn: string | null;
  /** Free text the chatbot quotes, e.g. "Захиалга хаагдсанаас хойш 2–3 долоо хоногт ирнэ". */
  arrivalNote: string | null;
  /** Max total units to accept across all variants; null = no limit. */
  limit: number | null;
};

export type PreorderInfo = PreorderSettings & {
  status: PreorderStatus;
  /** Units in all orders for this product (paid + awaiting payment + in review). */
  ordered: number;
  /** Units in paid orders: confirmed demand. */
  paid: number;
};

export type Product = {
  id: string;
  /**
   * Unique 3-letter code buyers type in chat, e.g. "TOS". Latin A–Z, always uppercase;
   * buyers may type it in any case.
   */
  code: string;
  /** Whether the system generated the code or the seller typed it. */
  codeSource: 'auto' | 'custom';
  saleType: SaleType;
  name: string;
  price: number;
  imageUrl: string | null;
  /**
   * Size/type breakdown; empty when there is none. For stock products `quantity` is
   * stock on hand; for preorders it is always 0 (see `PreorderDetail.tally`).
   */
  variants: ProductVariant[];
  /** Stock on hand when `variants` is empty; always 0 for preorders. */
  stock: number;
  /** Set only when `saleType` is `preorder`. */
  preorder: PreorderInfo | null;
  createdAt: string;
};

export type ProductInput = {
  saleType: SaleType;
  name: string;
  price: number;
  imageUrl: string | null;
  /**
   * `null` lets the server pick the code: an existing system-picked code is kept,
   * otherwise (new product, or reverting from a custom code) a new unique one is generated.
   */
  code: string | null;
  /** For preorders send quantity 0; only the names matter. */
  variants: { name: string; quantity: number }[];
  stock: number;
  /** Required when `saleType` is `preorder`, null otherwise. */
  preorder: PreorderSettings | null;
};

/** Ordered units for one variant of a preorder (variantName null = no breakdown). */
export type PreorderTallyRow = {
  variantName: string | null;
  ordered: number;
  paid: number;
};

export type PreorderDetail = {
  product: Product;
  /** One row per variant (including ones nobody ordered yet), in the product's variant order. */
  tally: PreorderTallyRow[];
  /** Every order containing this product, newest first. */
  orders: Order[];
};

// ---------- Orders ----------

export type Channel = 'live' | 'messenger' | 'instagram' | 'facebook';

export type OrderStatus = 'paid' | 'awaiting_payment' | 'needs_review';

export type OrderItem = {
  productId: string;
  productName: string;
  variantName: string | null;
  quantity: number;
  unitPrice: number;
};

export type Order = {
  id: string;
  /** 4-digit code the buyer writes in the bank transfer description. */
  code: string;
  customerName: string;
  channel: Channel;
  items: OrderItem[];
  total: number;
  status: OrderStatus;
  createdAt: string;
  paidAt: string | null;
  /** How the payment was matched to this order, once paid. */
  matchedBy: 'auto' | 'manual' | null;
};

export type DateRange = {
  from: string;
  to: string;
};

export type TodaySummary = {
  revenue: number;
  paidCount: number;
  awaitingCount: number;
  reviewCount: number;
  /** Most recent order events, newest first. */
  recent: Order[];
};

export type ReportSummary = DateRange & {
  revenue: number;
  paidCount: number;
  awaitingCount: number;
  /** Bank transfers that could not be linked to any order. */
  unmatchedPaymentCount: number;
  byChannel: { channel: Channel; count: number }[];
  topProducts: { productId: string; name: string; quantity: number; revenue: number }[];
};

// ---------- Payment review (шалгах) ----------

/** A transfer read from the bank SMS forwarded by the shop's phone. */
export type BankPayment = {
  id: string;
  amount: number;
  /** Sender name as the bank prints it, e.g. "БОЛДБААТАР Г.". */
  senderName: string;
  /** Transaction description the buyer typed; should contain the 4-digit order code. */
  note: string;
  bank: string;
  receivedAt: string;
  /** Original SMS text, for thorough checking. */
  rawMessage: string;
};

/** Why automatic matching gave up on a payment. */
export type ReviewReason =
  | 'code_typo' // note has a code close to (but not equal to) an order code
  | 'no_code' // no order code in the note
  | 'amount_mismatch' // code matches but the amount differs
  | 'duplicate'; // the matching order is already paid

/** One piece of evidence for or against a payment ↔ order match, computed by the server. */
export type MatchSignal = {
  level: 'ok' | 'warn' | 'bad';
  text: string;
};

export type MatchCandidate = {
  order: Order;
  signals: MatchSignal[];
  /** Short hint shown in lists, e.g. "нэр төстэй", "дүн 2,000₮ зөрүүтэй". */
  summary: string;
};

export type DifferenceAction =
  | 'refund' // overpaid: return the excess to the sender
  | 'keep' // overpaid: keep the excess
  | 'accept_short'; // underpaid: accept as fully paid

export type CaseResolution =
  | {
      kind: 'matched';
      orderId: string;
      orderCode: string;
      customerName: string;
      /** payment.amount − order.total; positive = overpaid. */
      difference: number;
      differenceAction: DifferenceAction | null;
      resolvedAt: string;
    }
  | {
      kind: 'no_order';
      category: 'refund' | 'other_income';
      resolvedAt: string;
    };

export type ReviewCase = {
  id: string;
  payment: BankPayment;
  reason: ReviewReason;
  status: 'open' | 'waiting_buyer' | 'resolved';
  /** The server's best guess, when it has a confident one. */
  suggestion: MatchCandidate | null;
  /** Other plausible orders, best first. */
  candidates: MatchCandidate[];
  /** Set after the seller asked a buyer through the chatbot. */
  contact: { orderId: string; customerName: string; message: string; sentAt: string } | null;
  /** Money the seller still has to (or already did) send back. */
  refund: { amount: number; status: 'pending' | 'done'; doneAt: string | null } | null;
  resolution: CaseResolution | null;
  note: string | null;
};

export type ReviewSummary = {
  open: number;
  waiting: number;
  refundsPending: number;
};

export type ResolveCaseInput =
  | { kind: 'matched'; orderId: string; differenceAction: DifferenceAction | null; note: string | null }
  | { kind: 'no_order'; category: 'refund' | 'other_income'; note: string | null };

// ---------- Integrations ----------

export type MetaPlatform = 'facebook' | 'instagram';

export type MetaConnection = {
  connected: boolean;
  /** Page name (Facebook) or @handle (Instagram). */
  accountName: string | null;
  connectedAt: string | null;
};

export type SmsListener = {
  connected: boolean;
  /** Endpoint the phone's automation posts forwarded bank SMS to. */
  webhookUrl: string;
  /** Secret sent in the `X-Listener-Token` header. */
  token: string;
  /** Bank SMS sender being forwarded, e.g. Khan Bank's short number. */
  senderNumber: string | null;
  deviceLabel: string | null;
  lastReceivedAt: string | null;
};

export type Integrations = {
  facebook: MetaConnection;
  instagram: MetaConnection;
  sms: SmsListener;
};

// ---------- Client ----------

/**
 * Machine-readable error codes. The backend sends them in the error envelope
 * `{ "error": { "code": "...", "message": "..." } }`; `network` and `timeout`
 * are produced by the client itself.
 */
export type ApiErrorCode =
  | 'invalid_credentials' // login: wrong phone/password
  | 'unauthorized' // any other call: token missing/expired → the app signs out
  | 'code_taken' // product code already used in this shop
  | 'not_found'
  | 'validation' // bad input; `message` is shown to the user as-is
  | 'conflict' // state changed meanwhile (e.g. case already resolved, order already paid)
  | 'network'
  | 'timeout'
  | 'unknown';

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'ApiError';
  }
}

export interface ApiClient {
  /** True when running against in-memory demo data instead of the backend. */
  readonly isMock: boolean;
  setToken(token: string | null): void;
  /** Called when an authenticated request gets 401, so the app can sign out. */
  setUnauthorizedHandler(handler: (() => void) | null): void;

  login(phone: string, password: string): Promise<Session>;
  logout(): Promise<void>;

  getTodaySummary(): Promise<TodaySummary>;

  listProducts(): Promise<Product[]>;
  getProduct(id: string): Promise<Product>;
  createProduct(input: ProductInput): Promise<Product>;
  updateProduct(id: string, input: ProductInput): Promise<Product>;
  updateProductPrice(id: string, price: number): Promise<Product>;
  deleteProduct(id: string): Promise<void>;
  getPreorder(id: string): Promise<PreorderDetail>;
  setPreorderStatus(id: string, status: PreorderStatus): Promise<Product>;

  getReport(range: DateRange): Promise<ReportSummary>;
  listOrders(range: DateRange): Promise<Order[]>;

  getReviewSummary(): Promise<ReviewSummary>;
  /** Open and waiting cases plus recently resolved ones. */
  listReviewCases(): Promise<ReviewCase[]>;
  getReviewCase(id: string): Promise<ReviewCase>;
  /** Orders matching a name, order code or amount, scored against the case's payment. */
  searchCaseCandidates(caseId: string, query: string): Promise<MatchCandidate[]>;
  resolveCase(id: string, input: ResolveCaseInput): Promise<ReviewCase>;
  /** Sends `message` to the order's buyer through the chatbot. */
  contactBuyer(id: string, orderId: string, message: string): Promise<ReviewCase>;
  markRefunded(id: string): Promise<ReviewCase>;
  reopenCase(id: string): Promise<ReviewCase>;

  getIntegrations(): Promise<Integrations>;
  /**
   * Starts Meta OAuth. Returns the consent URL to open; after the backend handles
   * Meta's callback it redirects the browser to `returnUrl`. `authUrl` is null when
   * the connection completed without a browser step (demo mode).
   */
  connectMeta(platform: MetaPlatform, returnUrl: string): Promise<{ authUrl: string | null }>;
  disconnectMeta(platform: MetaPlatform): Promise<Integrations>;
}

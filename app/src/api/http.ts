/**
 * HTTP implementation of the API against the Go backend.
 * The full contract (paths, JSON shapes, errors) is in docs/api/openapi.yaml.
 */
import {
  ApiError,
  type ApiClient,
  type ApiErrorCode,
  type DateRange,
  type Integrations,
  type MatchCandidate,
  type Order,
  type OrderPage,
  type PreorderDetail,
  type Product,
  type ProductInput,
  type ReportSummary,
  type ReviewCase,
  type ReviewSummary,
  type Session,
  type ShopSettings,
  type TodaySummary,
} from './types';
import { imageFormData } from './upload-form';

const TIMEOUT_MS = 20_000;
const UPLOAD_TIMEOUT_MS = 60_000;

const SERVER_CODES: ApiErrorCode[] = [
  'invalid_credentials',
  'unauthorized',
  'code_taken',
  'not_found',
  'validation',
  'conflict',
];

function codeFromStatus(status: number, path: string): ApiErrorCode {
  if (status === 401) return path === '/auth/login' ? 'invalid_credentials' : 'unauthorized';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 400 || status === 422) return 'validation';
  return 'unknown';
}

export function createHttpApi(baseUrl: string): ApiClient {
  let token: string | null = null;
  let onUnauthorized: (() => void) | null = null;

  async function send(
    method: string,
    path: string,
    body?: BodyInit,
    contentType?: string,
    timeoutMs = TIMEOUT_MS,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          ...(contentType && { 'Content-Type': contentType }),
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body,
        signal: controller.signal,
      });
    } catch {
      throw new ApiError(controller.signal.aborted ? 'timeout' : 'network');
    } finally {
      clearTimeout(timer);
    }
  }

  async function parse<T>(response: Response, path: string): Promise<T> {
    if (!response.ok) {
      // Error envelope: { "error": { "code": "code_taken", "message": "..." } }
      let code: ApiErrorCode | undefined;
      let message: string | undefined;
      try {
        const payload = (await response.json()) as { error?: { code?: string; message?: string } };
        code = payload.error?.code as ApiErrorCode | undefined;
        message = payload.error?.message;
      } catch {
        // Not JSON; fall back to the status code.
      }
      if (!code || !SERVER_CODES.includes(code)) code = codeFromStatus(response.status, path);
      if (code === 'unauthorized') onUnauthorized?.();
      throw new ApiError(code, message);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  async function request<T>(method: string, path: string, json?: unknown): Promise<T> {
    const response = await send(
      method,
      path,
      json !== undefined ? JSON.stringify(json) : undefined,
      json !== undefined ? 'application/json' : undefined,
    );
    return parse<T>(response, path);
  }

  /** Uploads a locally picked image (file:, blob: or data: URI) and returns its stored URL. */
  async function uploadImage(uri: string): Promise<string> {
    const path = '/uploads/images';
    // No Content-Type header: fetch sets the multipart boundary itself.
    const response = await send('POST', path, await imageFormData(uri), undefined, UPLOAD_TIMEOUT_MS);
    return (await parse<{ url: string }>(response, path)).url;
  }

  /** Products are saved with a server URL, so upload a newly picked image first. */
  async function withUploadedImage(input: ProductInput): Promise<ProductInput> {
    if (!input.imageUrl || /^https?:\/\//i.test(input.imageUrl)) return input;
    return { ...input, imageUrl: await uploadImage(input.imageUrl) };
  }

  const range = ({ from, to }: DateRange) =>
    `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

  return {
    isMock: false,
    setToken(next) {
      token = next;
    },
    setUnauthorizedHandler(handler) {
      onUnauthorized = handler;
    },

    login: (phone, password) => request<Session>('POST', '/auth/login', { phone, password }),
    logout: () => request<void>('POST', '/auth/logout'),
    changePassword: (currentPassword, newPassword) =>
      request<void>('POST', '/auth/password', { currentPassword, newPassword }),
    requestPasswordReset: (phone) =>
      request<{ sentTo: string }>('POST', '/auth/password-reset', { phone }),
    confirmPasswordReset: (phone, code, newPassword) =>
      request<void>('POST', '/auth/password-reset/confirm', { phone, code, newPassword }),

    getShopSettings: () => request<ShopSettings>('GET', '/settings'),
    updateBankAccount: (account) => request<ShopSettings>('PUT', '/settings/bank-account', account),

    getTodaySummary: () => request<TodaySummary>('GET', '/dashboard/today'),

    listProducts: () => request<Product[]>('GET', '/products'),
    getProduct: (id) => request<Product>('GET', `/products/${id}`),
    createProduct: async (input) =>
      request<Product>('POST', '/products', await withUploadedImage(input)),
    updateProduct: async (id, input) =>
      request<Product>('PUT', `/products/${id}`, await withUploadedImage(input)),
    updateProductPrice: (id, price) => request<Product>('PATCH', `/products/${id}`, { price }),
    deleteProduct: (id) => request<void>('DELETE', `/products/${id}`),
    getPreorder: (id) => request<PreorderDetail>('GET', `/products/${id}/preorder`),
    setPreorderStatus: (id, status) =>
      request<Product>('POST', `/products/${id}/preorder/status`, { status }),

    getReport: (r) => request<ReportSummary>('GET', `/reports/summary?${range(r)}`),
    listOrders: (r) => request<Order[]>('GET', `/orders?${range(r)}`),

    searchOrders: ({ view, q, cursor, limit }) => {
      const params = new URLSearchParams({ view });
      if (q) params.set('q', q);
      if (cursor) params.set('cursor', cursor);
      if (limit) params.set('limit', String(limit));
      return request<OrderPage>('GET', `/orders/search?${params}`);
    },
    getOrder: (id) => request<Order>('GET', `/orders/${id}`),
    updateOrder: (id, update) => request<Order>('PATCH', `/orders/${id}`, update),
    setOrdersFulfilled: (orderIds, fulfilled) =>
      request<Order[]>('POST', '/orders/fulfillment', { orderIds, fulfilled }),
    cancelOrder: (id, reason) => request<Order>('POST', `/orders/${id}/cancel`, { reason }),
    restoreOrder: (id) => request<Order>('POST', `/orders/${id}/restore`),

    getReviewSummary: () => request<ReviewSummary>('GET', '/review/summary'),
    listReviewCases: () => request<ReviewCase[]>('GET', '/review/cases'),
    getReviewCase: (id) => request<ReviewCase>('GET', `/review/cases/${id}`),
    searchCaseCandidates: (id, query) =>
      request<MatchCandidate[]>(
        'GET',
        `/review/cases/${id}/candidates?q=${encodeURIComponent(query)}`,
      ),
    resolveCase: (id, input) => request<ReviewCase>('POST', `/review/cases/${id}/resolve`, input),
    contactBuyer: (id, orderId, message) =>
      request<ReviewCase>('POST', `/review/cases/${id}/contact`, { orderId, message }),
    markRefunded: (id) => request<ReviewCase>('POST', `/review/cases/${id}/refunded`),
    reopenCase: (id) => request<ReviewCase>('POST', `/review/cases/${id}/reopen`),

    getIntegrations: () => request<Integrations>('GET', '/integrations'),
    connectMeta: (platform, returnUrl) =>
      request<{ authUrl: string | null }>('POST', `/integrations/meta/${platform}/connect`, {
        returnUrl,
      }),
    disconnectMeta: (platform) => request<Integrations>('DELETE', `/integrations/meta/${platform}`),
  };
}

CREATE TABLE IF NOT EXISTS shops (
 id text PRIMARY KEY, name text NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
 id text PRIMARY KEY, shop_id text NOT NULL REFERENCES shops(id),
 phone text UNIQUE NOT NULL, name text NOT NULL, password_hash text NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS service_keys (
 token_hash text PRIMARY KEY, shop_id text NOT NULL REFERENCES shops(id),
 role text NOT NULL CHECK(role IN ('chatbot','bank')), listener_id text UNIQUE,
 CHECK((role='bank' AND listener_id IS NOT NULL) OR (role='chatbot' AND listener_id IS NULL))
);
CREATE TABLE IF NOT EXISTS password_resets (
 phone text PRIMARY KEY, code_hash text NOT NULL, expires_at timestamptz NOT NULL,
 attempts integer NOT NULL DEFAULT 0, requested_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS products (
 shop_id text NOT NULL REFERENCES shops(id), id text NOT NULL, body jsonb NOT NULL,
 PRIMARY KEY(shop_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS products_code ON products(shop_id,(body->>'code'));
CREATE TABLE IF NOT EXISTS orders (
 shop_id text NOT NULL REFERENCES shops(id), id text NOT NULL, body jsonb NOT NULL,
 conversation_id text NOT NULL DEFAULT '', PRIMARY KEY(shop_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS orders_unpaid_code ON orders(shop_id,(body->>'code'))
 WHERE body->>'status' IN ('awaiting_payment','needs_review');
CREATE INDEX IF NOT EXISTS orders_created ON orders(shop_id,(body->>'createdAt'),id);
CREATE INDEX IF NOT EXISTS orders_paid ON orders(shop_id,(body->>'paidAt'),id);
CREATE INDEX IF NOT EXISTS orders_fulfilled ON orders(shop_id,(body->>'fulfilledAt'),id);
CREATE INDEX IF NOT EXISTS orders_cancelled ON orders(shop_id,(body->>'cancelledAt'),id);
CREATE TABLE IF NOT EXISTS payments (
 shop_id text NOT NULL REFERENCES shops(id), id text NOT NULL, external_id text NOT NULL,
 body jsonb NOT NULL, order_id text, PRIMARY KEY(shop_id,id), UNIQUE(shop_id,external_id),
 FOREIGN KEY(shop_id,order_id) REFERENCES orders(shop_id,id)
);
CREATE INDEX IF NOT EXISTS payments_received ON payments(shop_id,(body->>'receivedAt'));
CREATE TABLE IF NOT EXISTS review_cases (
 shop_id text NOT NULL REFERENCES shops(id), id text NOT NULL, body jsonb NOT NULL,
 payment_id text GENERATED ALWAYS AS (body->'payment'->>'id') STORED NOT NULL,
 undo jsonb, PRIMARY KEY(shop_id,id), UNIQUE(shop_id,payment_id),
 FOREIGN KEY(shop_id,payment_id) REFERENCES payments(shop_id,id)
);
CREATE INDEX IF NOT EXISTS review_received ON review_cases(shop_id,(body->'payment'->>'receivedAt'),id);
CREATE TABLE IF NOT EXISTS settings (
 shop_id text NOT NULL REFERENCES shops(id), id text NOT NULL, body jsonb NOT NULL,
 PRIMARY KEY(shop_id,id)
);
CREATE TABLE IF NOT EXISTS integrations (
 shop_id text NOT NULL REFERENCES shops(id), id text NOT NULL, body jsonb NOT NULL,
 PRIMARY KEY(shop_id,id)
);
CREATE TABLE IF NOT EXISTS idempotency (
 shop_id text NOT NULL REFERENCES shops(id), scope text NOT NULL, key text NOT NULL,
 request_hash text NOT NULL, response jsonb NOT NULL, PRIMARY KEY(shop_id,scope,key)
);
CREATE TABLE IF NOT EXISTS outbox (
 id text PRIMARY KEY, shop_id text NOT NULL REFERENCES shops(id), kind text NOT NULL,
 body jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 delivered_at timestamptz, attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outbox_pending ON outbox(next_attempt_at) WHERE delivered_at IS NULL;
CREATE TABLE IF NOT EXISTS uploads (
 id text PRIMARY KEY, shop_id text NOT NULL REFERENCES shops(id), content_type text NOT NULL, data bytea NOT NULL
);
CREATE TABLE IF NOT EXISTS webhook_targets (
 shop_id text NOT NULL REFERENCES shops(id), kind text NOT NULL CHECK(kind IN ('chatbot','sms')),
 url text NOT NULL, secret text NOT NULL, PRIMARY KEY(shop_id,kind)
);

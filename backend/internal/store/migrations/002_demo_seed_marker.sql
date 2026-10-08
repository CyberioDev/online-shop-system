CREATE TABLE IF NOT EXISTS demo_seeded_shops (
 shop_id text PRIMARY KEY REFERENCES shops(id) ON DELETE CASCADE,
 seeded_at timestamptz NOT NULL DEFAULT now()
);

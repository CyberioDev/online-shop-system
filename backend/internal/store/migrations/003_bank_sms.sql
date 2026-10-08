CREATE TABLE bank_sms_receipts (
 shop_id text NOT NULL REFERENCES shops(id), id text NOT NULL,
 sender text NOT NULL, raw_message text NOT NULL, received_at timestamptz NOT NULL,
 status text NOT NULL, reason text NOT NULL DEFAULT '', response jsonb NOT NULL,
 PRIMARY KEY(shop_id,id)
);

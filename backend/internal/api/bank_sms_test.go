package api

import (
	"context"
	"fmt"
	"testing"
)

func TestRawSMSFlow(t *testing.T) {
	f := setup(t)
	f.call(200, "PUT", "/settings/bank-account", f.ownerA, map[string]any{"bank": "Хаан банк", "accountNumber": "5123458198", "accountHolder": "Owner"})
	key := f.call(200, "POST", "/integrations/sms/rotate", f.ownerA, nil)
	token := key["token"].(string)
	path := key["webhookUrl"].(string)[len(f.s.PublicURL):]
	raw := "Khan Bank:Tany 5***8198 dansand ORLOGO:10,000.00MNT orj ULDEGDEL:500,000.00MNT bolloo.Utga:myanganbayar-s martbayasgalan myanganbayar-d"
	input := map[string]any{"id": "message-1", "sender": "131917", "message": raw}
	result := f.call(202, "POST", path, token, input)
	if result["status"] != "processed" {
		t.Fatal(result)
	}
	f.call(202, "POST", path, token, input)
	var count int
	if err := f.db.Pool.QueryRow(context.Background(), "SELECT count(*) FROM payments WHERE shop_id=$1 AND external_id='sms:message-1'", f.shopA).Scan(&count); err != nil || count != 1 {
		t.Fatalf("duplicates: %d %v", count, err)
	}
	var amount string
	if err := f.db.Pool.QueryRow(context.Background(), "SELECT body->>'amount' FROM payments WHERE shop_id=$1 AND external_id='sms:message-1'", f.shopA).Scan(&amount); err != nil || amount != "10000" {
		t.Fatal(amount, err)
	}

	product := f.product(f.ownerA, "SMS", 2)
	order := f.order(f.botA, product, "sms-order")
	matched := f.call(202, "POST", path, token, map[string]any{"id": "matched-sms", "sender": "131917", "message": "Khan Bank:Tany 5***8198 dansand ORLOGO:1,000.00MNT orj ULDEGDEL:99,000.00MNT bolloo.Utga:" + order["code"].(string)})
	if matched["result"].(map[string]any)["order"].(map[string]any)["status"] != "paid" {
		t.Fatal(matched)
	}
	rejected := f.call(202, "POST", path, token, map[string]any{"id": "wrong-account", "sender": "131917", "message": "Khan Bank:Tany 5***9999 dansand ORLOGO:1,000.00MNT orj ULDEGDEL:99,000.00MNT bolloo.Utga:" + order["code"].(string)})
	if rejected["status"] != "needs_review" {
		t.Fatal(rejected)
	}
	input["message"] = "changed message"
	f.call(409, "POST", path, token, input)
	input["id"] = "message-2"
	result = f.call(202, "POST", path, token, input)
	if result["status"] != "needs_review" {
		t.Fatal(result)
	}
	f.call(404, "POST", path, f.bankB, input)
	input["sender"] = "other"
	f.call(422, "POST", path, token, input)
	integrations := f.call(200, "GET", "/integrations", f.ownerA, nil)
	sms := integrations["sms"].(map[string]any)
	if sms["token"] != "" || len(sms["failures"].([]any)) != 2 {
		t.Fatal(sms)
	}
	// Rotating a phone credential must not revoke the original bank API key.
	f.call(200, "POST", "/integrations/sms/rotate", f.ownerA, nil)
	f.call(401, "POST", path, token, input)
	f.call(202, "POST", "/bank/transactions", f.bankA, map[string]any{"externalId": "normal-bank-id", "amount": 100, "senderName": "", "note": "", "bank": "Khan Bank", "receivedAt": "2026-10-08T12:00:00+08:00", "rawMessage": ""})
	var reason string
	if err := f.db.Pool.QueryRow(context.Background(), "SELECT body->>'reason' FROM review_cases WHERE shop_id=$1 AND body->'payment'->>'rawMessage'=$2", f.shopA, raw).Scan(&reason); err != nil || reason != "no_code" {
		t.Fatal(fmt.Sprint(reason, err))
	}
}

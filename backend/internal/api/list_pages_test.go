package api

import (
	"context"
	"fmt"
	"net/url"
	"testing"
)

func TestListDateTimeFiltersAndPagination(t *testing.T) {
	f := setup(t)
	f.bank(f.ownerA)
	ctx := context.Background()
	for i := 0; i < 3; i++ {
		p := f.product(f.ownerA, fmt.Sprintf("PA%c", 'A'+i), 10)
		stamp := fmt.Sprintf("2026-10-08T01:00:0%d.000000000Z", i)
		if _, err := f.db.Pool.Exec(ctx, "UPDATE products SET body=jsonb_set(body,'{createdAt}',to_jsonb($3::text)) WHERE shop_id=$1 AND id=$2", f.shopA, p, stamp); err != nil {
			t.Fatal(err)
		}
		o := f.call(201, "POST", "/chatbot/orders", f.botA, map[string]any{"customerName": "Buyer", "channel": "messenger", "conversationId": fmt.Sprintf("paged-conversation-%d", i), "items": []any{map[string]any{"productId": p, "variantName": nil, "quantity": 1}}}, map[string]string{"Idempotency-Key": fmt.Sprintf("paged-order-%d", i)})
		if _, err := f.db.Pool.Exec(ctx, "UPDATE orders SET body=jsonb_set(body,'{createdAt}',to_jsonb($3::text)) WHERE shop_id=$1 AND id=$2", f.shopA, o["id"], stamp); err != nil {
			t.Fatal(err)
		}
		f.call(202, "POST", "/bank/transactions", f.bankA, map[string]any{"externalId": fmt.Sprintf("paged-payment-%d", i), "amount": 100, "senderName": "", "note": "page-test", "bank": "Khan Bank", "receivedAt": stamp, "rawMessage": ""})
	}
	// +08:00 is normalized to UTC; upper bound excludes the third item exactly.
	rangeQuery := "from=" + url.QueryEscape("2026-10-08T09:00:00+08:00") + "&to=" + url.QueryEscape("2026-10-08T09:00:02+08:00") + "&limit=1"
	for _, test := range []struct{ path, field string }{{"/products", "products"}, {"/orders", "orders"}, {"/transactions", "transactions"}, {"/review/cases", "cases"}, {"/orders/search?view=all", "orders"}} {
		sep := "?"
		if test.path == "/orders/search?view=all" {
			sep = "&"
		}
		path := test.path + sep + rangeQuery
		first := f.call(200, "GET", path, f.ownerA, nil)
		if first["total"].(float64) != 2 || len(first[test.field].([]any)) != 1 {
			t.Fatal(test.path, first)
		}
		cursor := first["nextCursor"].(string)
		second := f.call(200, "GET", path+"&cursor="+url.QueryEscape(cursor), f.ownerA, nil)
		if second["nextCursor"] != nil || first[test.field].([]any)[0].(map[string]any)["id"] == second[test.field].([]any)[0].(map[string]any)["id"] {
			t.Fatal(test.path, second)
		}
		f.call(422, "GET", path+"&cursor="+url.QueryEscape(cursor), f.ownerB, nil)
		f.call(422, "GET", path+"&q=changed&cursor="+url.QueryEscape(cursor), f.ownerA, nil)
	}
	products := f.call(200, "GET", "/products?from=2026-10-08T01:00:01Z&saleType=stock&q=PA", f.ownerA, nil)
	if products["total"].(float64) != 2 {
		t.Fatal(products)
	}
	payments := f.call(200, "GET", "/transactions?to=2026-10-08T01:00:01Z&q=page-test", f.ownerA, nil)
	if payments["total"].(float64) != 1 {
		t.Fatal(payments)
	}
	f.call(422, "GET", "/transactions?from=invalid", f.ownerA, nil)
	f.call(422, "GET", "/products?saleType=invalid", f.ownerA, nil)
	f.call(401, "GET", "/transactions", f.bankA, nil)
}

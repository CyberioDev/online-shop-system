package api

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"online-shop/backend/internal/delivery"
	"online-shop/backend/internal/shop"
	"online-shop/backend/internal/store"
)

type fixture struct {
	a                                                      *Server
	s                                                      *shop.Service
	db                                                     *store.Store
	ownerA, ownerB, botA, botB, bankA, bankB, shopA, shopB string
	t                                                      *testing.T
}

func setup(t *testing.T) *fixture {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set TEST_DATABASE_URL or run docker compose -f compose.test.yaml up")
	}
	db, e := store.Open(context.Background(), url)
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(db.Pool.Close)
	if e = db.Migrate(context.Background()); e != nil {
		t.Fatal(e)
	}
	s := &shop.Service{DB: db, CursorKey: []byte(strings.Repeat("cursor", 8)), PublicURL: "http://localhost:8080"}
	f := &fixture{s: s, db: db, t: t, shopA: shop.ID(), shopB: shop.ID(), botA: shop.ID() + shop.ID(), botB: shop.ID() + shop.ID(), bankA: shop.ID() + shop.ID(), bankB: shop.ID() + shop.ID()}
	for i, v := range []struct{ id, bot, bank string }{{f.shopA, f.botA, f.bankA}, {f.shopB, f.botB, f.bankB}} {
		phone := fmt.Sprintf("%08d", time.Now().UnixNano()%90_000_000+10_000_000+int64(i))
		e = s.Bootstrap(context.Background(), shop.Bootstrap{ShopID: v.id, ShopName: "Shop", OwnerName: "Owner", Phone: phone, Password: "test-password", ChatbotKey: v.bot, BankKey: v.bank})
		if e != nil {
			t.Fatal(e)
		}
		session, e := s.Login(context.Background(), phone, "test-password")
		if e != nil {
			t.Fatal(e)
		}
		if i == 0 {
			f.ownerA = session.Token
		} else {
			f.ownerB = session.Token
		}
	}
	t.Cleanup(func() {
		_, _ = db.Pool.Exec(context.Background(), "DELETE FROM webhook_targets WHERE shop_id=$1 OR shop_id=$2", f.shopA, f.shopB)
	})
	f.a = New(s, []string{"http://localhost:8081"})
	return f
}
func (f *fixture) request(method, path, token string, body any, headers map[string]string) (int, map[string]any) {
	var raw []byte
	if body != nil {
		raw, _ = json.Marshal(body)
	}
	r := httptest.NewRequest(method, path, bytes.NewReader(raw))
	r.Header.Set("Content-Type", "application/json")
	if token != "" {
		r.Header.Set("Authorization", "Bearer "+token)
	}
	for k, v := range headers {
		r.Header.Set(k, v)
	}
	w := httptest.NewRecorder()
	f.a.Echo.ServeHTTP(w, r)
	out := map[string]any{}
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	return w.Code, out
}
func (f *fixture) call(want int, method, path, token string, body any, headers ...map[string]string) map[string]any {
	f.t.Helper()
	var h map[string]string
	if len(headers) > 0 {
		h = headers[0]
	}
	status, out := f.request(method, path, token, body, h)
	if status != want {
		f.t.Fatalf("%s %s: status %d want %d: %+v", method, path, status, want, out)
	}
	return out
}
func (f *fixture) product(token, code string, stock int) string {
	v := f.call(201, "POST", "/products", token, map[string]any{"saleType": "stock", "name": "Shirt", "price": 1000, "imageUrl": nil, "code": code, "variants": []any{}, "stock": stock, "preorder": nil})
	return v["id"].(string)
}
func (f *fixture) bank(token string) {
	f.call(200, "PUT", "/settings/bank-account", token, map[string]any{"bank": "Khan", "accountNumber": "1234567890", "accountHolder": "Owner"})
}
func (f *fixture) order(bot, id, key string) map[string]any {
	return f.call(201, "POST", "/chatbot/orders", bot, map[string]any{"customerName": "Buyer", "channel": "messenger", "conversationId": "conversation-1", "items": []any{map[string]any{"productId": id, "variantName": nil, "quantity": 1}}}, map[string]string{"Idempotency-Key": key})
}
func payment(code, external string, amount int) map[string]any {
	return map[string]any{"externalId": external, "amount": amount, "senderName": "Buyer", "note": code, "bank": "Khan", "receivedAt": "2026-09-19T14:32:00+08:00", "rawMessage": "bank notification"}
}
func TestTenantIsolationAndPages(t *testing.T) {
	f := setup(t)
	id := f.product(f.ownerA, "AAA", 5)
	f.product(f.ownerA, "BBB", 5)
	f.product(f.ownerB, "AAA", 5)
	f.call(404, "GET", "/products/"+id, f.ownerB, nil)
	f.call(404, "PATCH", "/products/"+id, f.ownerB, map[string]any{"price": 100})
	f.call(404, "DELETE", "/products/"+id, f.ownerB, nil)
	f.call(401, "GET", "/products", f.botA, nil)
	f.call(401, "POST", "/bank/transactions", f.botA, payment("1234", "wrong-role", 1000))
	f.call(401, "GET", "/chatbot/products", f.ownerA, nil)
	first := f.call(200, "GET", "/products?limit=1", f.ownerA, nil)
	if first["total"] != float64(2) || len(first["products"].([]any)) != 1 {
		t.Fatalf("bad page: %+v", first)
	}
	cursor := first["nextCursor"].(string)
	next := f.call(200, "GET", "/products?limit=1&cursor="+cursor, f.ownerA, nil)
	if next["nextCursor"] != nil {
		t.Fatal("last cursor not null")
	}
	f.call(422, "GET", "/products?limit=1&cursor="+cursor, f.ownerB, nil)
	f.call(422, "GET", "/products?limit=2&cursor="+cursor, f.ownerA, nil)
	f.call(422, "GET", "/products?limit=201", f.ownerA, nil)
	f.call(422, "GET", "/orders", f.ownerA, nil)
	f.call(422, "GET", "/orders?from=2026-01-01&to=2026-01-02", f.ownerA, nil)
	f.bank(f.ownerA)
	f.bank(f.ownerB)
	f.call(404, "POST", "/chatbot/orders", f.botB, map[string]any{"customerName": "Buyer", "channel": "messenger", "items": []any{map[string]any{"productId": id, "quantity": 1}}}, map[string]string{"Idempotency-Key": "foreign-product"})
}
func TestOrderPaymentReviewWorkflow(t *testing.T) {
	f := setup(t)
	f.bank(f.ownerA)
	id := f.product(f.ownerA, "PAY", 10)
	o := f.order(f.botA, id, "order-1")
	orderID := o["id"].(string)
	code := o["code"].(string)
	replay := f.order(f.botA, id, "order-1")
	if replay["id"] != orderID {
		t.Fatal("order replay created a duplicate")
	}
	p := f.call(200, "GET", "/products/"+id, f.ownerA, nil)
	if p["stock"] != float64(9) {
		t.Fatalf("stock reserved twice: %+v", p)
	}
	event := payment(code, "bank-txn-1", 1000)
	paid := f.call(202, "POST", "/bank/transactions", f.bankA, event)
	if paid["order"].(map[string]any)["status"] != "paid" {
		t.Fatal("payment did not match")
	}
	again := f.call(202, "POST", "/bank/transactions", f.bankA, event)
	if again["payment"].(map[string]any)["id"] != paid["payment"].(map[string]any)["id"] {
		t.Fatal("duplicate payment")
	}
	event["amount"] = 1001
	f.call(409, "POST", "/bank/transactions", f.bankA, event)
	f.call(202, "POST", "/bank/transactions", f.bankB, payment(code, "bank-txn-1", 1000)) // Same external ID is valid in another tenant.
	f.call(404, "GET", "/orders/"+orderID, f.ownerB, nil)
	f.call(200, "PATCH", "/orders/"+orderID, f.ownerA, map[string]any{"sellerNote": "owner secret"})
	bot := f.call(200, "GET", "/chatbot/orders/"+orderID, f.botA, nil)
	if _, exists := bot["sellerNote"]; exists {
		t.Fatal("leaked owner note")
	}
	f.call(422, "PATCH", "/chatbot/orders/"+orderID+"/delivery", f.botA, map[string]any{"sellerNote": "overwrite"})
	f.call(200, "POST", "/orders/fulfillment", f.ownerA, map[string]any{"orderIds": []string{orderID}, "fulfilled": true})
	f.call(200, "POST", "/orders/"+orderID+"/cancel", f.ownerA, map[string]any{"reason": nil})
	p = f.call(200, "GET", "/products/"+id, f.ownerA, nil)
	if p["stock"] != float64(10) {
		t.Fatal("cancel did not release stock")
	}
	f.call(200, "POST", "/orders/"+orderID+"/restore", f.ownerA, nil)
	o2 := f.order(f.botA, id, "order-2")
	caseResult := f.call(202, "POST", "/bank/transactions", f.bankA, payment(o2["code"].(string), "bank-txn-2", 1200))
	caseID := caseResult["reviewCase"].(map[string]any)["id"].(string)
	f.call(404, "GET", "/review/cases/"+caseID, f.ownerB, nil)
	f.call(409, "POST", "/orders/"+o2["id"].(string)+"/cancel", f.ownerA, map[string]any{"reason": nil})
	resolved := f.call(200, "POST", "/review/cases/"+caseID+"/resolve", f.ownerA, map[string]any{"kind": "matched", "orderId": o2["id"], "differenceAction": "refund", "note": nil})
	if resolved["refund"].(map[string]any)["amount"] != float64(200) {
		t.Fatal("wrong refund")
	}
	f.call(200, "POST", "/review/cases/"+caseID+"/reopen", f.ownerA, nil)
	f.call(200, "POST", "/review/cases/"+caseID+"/resolve", f.ownerA, map[string]any{"kind": "matched", "orderId": o2["id"], "differenceAction": "refund", "note": nil})
	f.call(200, "POST", "/review/cases/"+caseID+"/refunded", f.ownerA, nil)
	f.call(409, "POST", "/review/cases/"+caseID+"/reopen", f.ownerA, nil)
	f.call(200, "GET", "/dashboard/today", f.ownerA, nil)
	report := f.call(200, "GET", "/reports/summary?from=2020-01-01T00:00:00Z&to=2099-01-01T00:00:00Z", f.ownerA, nil)
	if report["paidCount"] != float64(2) || report["revenue"] != float64(2000) {
		t.Fatalf("wrong report: %+v", report)
	}
	rangePath := "/review/cases?from=2026-09-19T06:32:00Z&to=2026-09-19T06:32:01Z"
	cases := f.call(200, "GET", rangePath, f.ownerA, nil)
	if cases["total"] != float64(1) {
		t.Fatal("inclusive lower bound failed")
	}
	cases = f.call(200, "GET", "/review/cases?from=2026-09-19T06:31:00Z&to=2026-09-19T06:32:00Z", f.ownerA, nil)
	if cases["total"] != float64(0) {
		t.Fatal("exclusive upper bound failed")
	}
}
func TestConcurrentStockAndAtomicFulfillment(t *testing.T) {
	f := setup(t)
	f.bank(f.ownerA)
	id := f.product(f.ownerA, "ONE", 1)
	var wg sync.WaitGroup
	codes := make(chan int, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			status, _ := f.request("POST", "/chatbot/orders", f.botA, map[string]any{"customerName": "Buyer", "channel": "messenger", "items": []any{map[string]any{"productId": id, "quantity": 1}}}, map[string]string{"Idempotency-Key": fmt.Sprint(i)})
			codes <- status
		}(i)
	}
	wg.Wait()
	close(codes)
	counts := map[int]int{}
	for c := range codes {
		counts[c]++
	}
	if counts[201] != 1 || counts[409] != 1 {
		t.Fatalf("oversold stock: %v", counts)
	}
	p := f.call(200, "GET", "/products/"+id, f.ownerA, nil)
	if p["stock"] != float64(0) {
		t.Fatal("bad final stock")
	}
}
func TestOutboxDeliveryAndTenantTargets(t *testing.T) {
	f := setup(t)
	f.bank(f.ownerA)
	id := f.product(f.ownerA, "WEB", 5)
	o := f.order(f.botA, id, "web-order")
	f.call(200, "PATCH", "/orders/"+o["id"].(string), f.ownerA, map[string]any{"sellerNote": "private"})
	f.call(202, "POST", "/bank/transactions", f.bankA, payment(o["code"].(string), "web-payment", 1000))
	secret := strings.Repeat("s", 32)
	attempts := 0
	var eventID string
	receiver := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		raw, _ := io.ReadAll(r.Body)
		mac := hmac.New(sha256.New, []byte(secret))
		mac.Write([]byte(r.Header.Get("X-Webhook-Timestamp") + "."))
		mac.Write(raw)
		if r.Header.Get("X-Webhook-Signature") != "sha256="+hex.EncodeToString(mac.Sum(nil)) {
			t.Error("invalid signature")
		}
		if r.Header.Get("Authorization") != "Bearer "+secret {
			t.Error("missing shared secret")
		}
		if strings.Contains(string(raw), "sellerNote") || strings.Contains(string(raw), "private") {
			t.Error("leaked owner note")
		}
		var event map[string]any
		_ = json.Unmarshal(raw, &event)
		if event["shopId"] != f.shopA {
			t.Error("wrong tenant")
		}
		if attempts == 1 {
			eventID = event["id"].(string)
			w.WriteHeader(500)
		} else {
			if event["id"] != eventID {
				t.Error("retry ID changed")
			}
			w.WriteHeader(204)
		}
	}))
	defer receiver.Close()
	_, e := f.db.Pool.Exec(context.Background(), "INSERT INTO webhook_targets(shop_id,kind,url,secret) VALUES($1,'chatbot',$2,$3)", f.shopA, receiver.URL, secret)
	if e != nil {
		t.Fatal(e)
	}
	worker := delivery.Worker{DB: f.db, HTTP: receiver.Client()}
	if ok, e := worker.Once(context.Background()); e != nil || !ok {
		t.Fatalf("first delivery %v %v", ok, e)
	}
	_, e = f.db.Pool.Exec(context.Background(), "UPDATE outbox SET next_attempt_at=now() WHERE shop_id=$1", f.shopA)
	if e != nil {
		t.Fatal(e)
	}
	if ok, e := worker.Once(context.Background()); e != nil || !ok {
		t.Fatalf("retry %v %v", ok, e)
	}
	if attempts != 2 {
		t.Fatalf("expected retry, got %d", attempts)
	}
	if ok, e := worker.Once(context.Background()); e != nil || ok {
		t.Fatalf("delivered event sent again: %v %v", ok, e)
	}
}

func TestAuthPasswordResetAndSessionRevocation(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	identity, e := f.s.Authenticate(ctx, f.ownerA, "owner")
	if e != nil {
		t.Fatal(e)
	}
	var phone string
	if e = f.db.Pool.QueryRow(ctx, "SELECT phone FROM users WHERE id=$1", identity.UserID).Scan(&phone); e != nil {
		t.Fatal(e)
	}
	other, e := f.s.Login(ctx, phone, "test-password")
	if e != nil {
		t.Fatal(e)
	}
	f.call(422, "POST", "/auth/password", f.ownerA, map[string]any{"currentPassword": "wrong", "newPassword": "changed-password"})
	f.call(204, "POST", "/auth/password", f.ownerA, map[string]any{"currentPassword": "test-password", "newPassword": "changed-password"})
	f.call(401, "GET", "/settings", other.Token, nil)
	f.call(200, "GET", "/settings", f.ownerA, nil)
	if e = f.s.RequestReset(ctx, phone); e != nil {
		t.Fatal(e)
	} // Unconfigured provider does not leak account state.
	_, e = f.db.Pool.Exec(ctx, "INSERT INTO webhook_targets(shop_id,kind,url,secret) VALUES($1,'sms','https://example.com/sms',$2)", f.shopA, strings.Repeat("sms-key", 6))
	if e != nil {
		t.Fatal(e)
	}
	if e = f.s.RequestReset(ctx, phone); e != nil {
		t.Fatal(e)
	}
	var raw []byte
	if e = f.db.Pool.QueryRow(ctx, "SELECT body FROM outbox WHERE shop_id=$1 AND kind='sms.password_reset' ORDER BY created_at DESC LIMIT 1", f.shopA).Scan(&raw); e != nil {
		t.Fatal(e)
	}
	var data map[string]string
	_ = json.Unmarshal(raw, &data)
	if e = f.s.ConfirmReset(ctx, phone, "xxxxxx", "reset-password"); e == nil {
		t.Fatal("accepted incorrect reset code")
	}
	if e = f.s.ConfirmReset(ctx, phone, data["code"], "reset-password"); e != nil {
		t.Fatal(e)
	}
	f.call(401, "GET", "/settings", f.ownerA, nil)
	session, e := f.s.Login(ctx, phone, "reset-password")
	if e != nil {
		t.Fatal(e)
	}
	if e = f.s.ConfirmReset(ctx, phone, data["code"], "reused-password"); e == nil {
		t.Fatal("reset code replay succeeded")
	}
	f.call(204, "POST", "/auth/logout", session.Token, nil)
	f.call(401, "GET", "/settings", session.Token, nil)
}
func TestPreorderTallyAndAtomicBulk(t *testing.T) {
	f := setup(t)
	f.bank(f.ownerA)
	p := f.call(201, "POST", "/products", f.ownerA, map[string]any{"saleType": "preorder", "name": "Preorder shirt", "price": 1000, "imageUrl": nil, "code": "PRE", "variants": []any{}, "stock": 0, "preorder": map[string]any{"closesOn": nil, "arrivalNote": nil, "limit": 2}})
	id := p["id"].(string)
	first := f.order(f.botA, id, "pre-1")
	second := f.order(f.botA, id, "pre-2")
	f.call(202, "POST", "/bank/transactions", f.bankA, payment(first["code"].(string), "pre-pay", 1000))
	overview := f.call(200, "GET", "/products/"+id+"/preorder?limit=1", f.ownerA, nil)
	if overview["total"] != float64(2) || len(overview["orders"].([]any)) != 1 {
		t.Fatal("buyer list not paginated")
	}
	tally := overview["tally"].([]any)[0].(map[string]any)
	if tally["ordered"] != float64(2) || tally["paid"] != float64(1) {
		t.Fatalf("tally only counted page: %+v", tally)
	}
	if overview["product"].(map[string]any)["preorder"].(map[string]any)["status"] != "closed" {
		t.Fatal("preorder limit did not close orders")
	}
	f.call(409, "POST", "/orders/fulfillment", f.ownerA, map[string]any{"orderIds": []any{first["id"], second["id"]}, "fulfilled": true})
	firstAfter := f.call(200, "GET", "/orders/"+first["id"].(string), f.ownerA, nil)
	if firstAfter["fulfilledAt"] != nil {
		t.Fatal("failed bulk request partially committed")
	}
	f.call(503, "POST", "/products/"+id+"/preorder/status", f.ownerA, map[string]any{"status": "arrived"})
	f.call(200, "PUT", "/integrations/chatbot", f.ownerA, map[string]any{"url": "https://example.com/automation", "secret": strings.Repeat("webhook", 5)})
	f.call(200, "POST", "/products/"+id+"/preorder/status", f.ownerA, map[string]any{"status": "arrived"})
	var notifications int
	if e := f.db.Pool.QueryRow(context.Background(), "SELECT count(*) FROM outbox WHERE shop_id=$1 AND kind='preorder.arrived'", f.shopA).Scan(&notifications); e != nil {
		t.Fatal(e)
	}
	if notifications != 1 {
		t.Fatalf("notified unpaid buyers: %d", notifications)
	}
	f.call(200, "GET", "/integrations", f.ownerA, nil)
}
func TestCaseContactNoOrderAndTenantForeignKey(t *testing.T) {
	f := setup(t)
	f.bank(f.ownerA)
	id := f.product(f.ownerA, "REV", 10)
	o := f.order(f.botA, id, "review-order")
	result := f.call(202, "POST", "/bank/transactions", f.bankA, payment("", "unmatched", 1000))
	caseID := result["reviewCase"].(map[string]any)["id"].(string)
	f.call(503, "POST", "/review/cases/"+caseID+"/contact", f.ownerA, map[string]any{"orderId": o["id"], "message": "Please confirm"})
	f.call(200, "PUT", "/integrations/chatbot", f.ownerA, map[string]any{"url": "https://example.com/hook", "secret": strings.Repeat("contact", 5)})
	c := f.call(200, "POST", "/review/cases/"+caseID+"/contact", f.ownerA, map[string]any{"orderId": o["id"], "message": "Please confirm"})
	if c["status"] != "waiting_buyer" {
		t.Fatal("contact status not updated")
	}
	f.call(200, "GET", "/review/cases/"+caseID+"/candidates?q=Buyer", f.ownerA, nil)
	f.call(200, "POST", "/review/cases/"+caseID+"/resolve", f.ownerA, map[string]any{"kind": "no_order", "category": "other_income", "note": nil})
	c = f.call(200, "POST", "/review/cases/"+caseID+"/reopen", f.ownerA, nil)
	if c["status"] != "waiting_buyer" {
		t.Fatal("reopen lost contact state")
	}
	foreign := f.call(202, "POST", "/bank/transactions", f.bankB, payment("", "foreign-bank", 1000))
	foreignID := foreign["payment"].(map[string]any)["id"].(string)
	_, e := f.db.Pool.Exec(context.Background(), "UPDATE payments SET order_id=$3 WHERE shop_id=$1 AND id=$2", f.shopB, foreignID, o["id"])
	if e == nil {
		t.Fatal("database allowed a cross-tenant payment/order relationship")
	}
	f.call(404, "POST", "/hooks/sms/"+f.shopA, f.bankB, payment("", "wrong-listener", 1000))
}

package shop

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"

	"online-shop/backend/internal/store"
)

type Query struct {
	From, To                  Timestamp
	Limit                     int
	Cursor, View, Q, SaleType string
}

func ParseQuery(v url.Values, requireRange bool) (Query, error) {
	q := Query{Limit: 50, Cursor: v.Get("cursor"), View: v.Get("view"), Q: v.Get("q"), SaleType: v.Get("saleType")}
	for _, key := range []string{"from", "to", "limit", "cursor", "view", "q", "saleType"} {
		if len(v[key]) > 1 {
			return q, Invalid()
		}
	}
	if _, ok := v["limit"]; ok {
		n, e := strconv.Atoi(v.Get("limit"))
		if e != nil || n < 1 || n > 200 {
			return q, Invalid()
		}
		q.Limit = n
	}
	if _, ok := v["cursor"]; ok && q.Cursor == "" {
		return q, Invalid()
	}
	if len(q.Cursor) > 4096 || len(q.Q) > 200 {
		return q, Invalid()
	}
	if q.SaleType != "" && q.SaleType != "stock" && q.SaleType != "preorder" {
		return q, Invalid()
	}
	for _, bound := range []string{"from", "to"} {
		if requireRange || v.Has(bound) {
			at, err := time.Parse(time.RFC3339Nano, v.Get(bound))
			if err != nil {
				return q, Invalid()
			}
			if bound == "from" {
				q.From = Stamp(at)
			} else {
				q.To = Stamp(at)
			}
		}
	}
	if q.From != "" && q.To != "" && q.From >= q.To {
		return q, Invalid()
	}
	return q, nil
}

type cursor struct{ Scope, Key, ID string }

func (s *Service) encodeCursor(c cursor) string {
	b, _ := json.Marshal(c)
	m := hmac.New(sha256.New, s.CursorKey)
	m.Write(b)
	return base64.RawURLEncoding.EncodeToString(b) + "." + base64.RawURLEncoding.EncodeToString(m.Sum(nil))
}
func (s *Service) decodeCursor(raw, scope string) (cursor, error) {
	var c cursor
	parts := strings.Split(raw, ".")
	if len(parts) != 2 {
		return c, Invalid()
	}
	b, e := base64.RawURLEncoding.DecodeString(parts[0])
	if e != nil {
		return c, Invalid()
	}
	sig, e := base64.RawURLEncoding.DecodeString(parts[1])
	if e != nil {
		return c, Invalid()
	}
	m := hmac.New(sha256.New, s.CursorKey)
	m.Write(b)
	if !hmac.Equal(sig, m.Sum(nil)) || json.Unmarshal(b, &c) != nil || c.Scope != scope || c.ID == "" {
		return c, Invalid()
	}
	return c, nil
}
func scope(shop, endpoint string, q Query) string {
	q.Cursor = ""
	b, _ := json.Marshal(q)
	return Hash(shop + "\n" + endpoint + "\n" + string(b))
}
func page[T any](ctx context.Context, s *Service, t *store.Tx, table, endpoint, key, where string, desc bool, q Query, args []any) ([]T, int64, *string, error) {
	if q.Limit < 1 || q.Limit > 200 {
		return nil, 0, nil, Invalid()
	}
	bind := append([]any{t.ShopID}, args...)
	var total int64
	if e := t.QueryRow(ctx, "SELECT count(*) FROM "+table+" WHERE shop_id=$1 "+where, bind...).Scan(&total); e != nil {
		return nil, 0, nil, e
	}
	sc := scope(t.ShopID, endpoint, q)
	direction, operator := "ASC", ">"
	if desc {
		direction, operator = "DESC", "<"
	}
	if q.Cursor != "" {
		c, e := s.decodeCursor(q.Cursor, sc)
		if e != nil {
			return nil, 0, nil, e
		}
		where += fmt.Sprintf(" AND (%s,id) %s ($%d,$%d)", key, operator, len(bind)+1, len(bind)+2)
		bind = append(bind, c.Key, c.ID)
	}
	bind = append(bind, q.Limit+1)
	sql := fmt.Sprintf("SELECT body,%s,id FROM %s WHERE shop_id=$1 %s ORDER BY %s %s,id %s LIMIT $%d", key, table, where, key, direction, direction, len(bind))
	rows, e := t.Query(ctx, sql, bind...)
	if e != nil {
		return nil, 0, nil, e
	}
	defer rows.Close()
	result := []T{}
	keys := []cursor{}
	for rows.Next() {
		var raw []byte
		var k, id string
		var item T
		if e = rows.Scan(&raw, &k, &id); e != nil {
			return nil, 0, nil, e
		}
		if e = json.Unmarshal(raw, &item); e != nil {
			return nil, 0, nil, e
		}
		result = append(result, item)
		keys = append(keys, cursor{sc, k, id})
	}
	if e = rows.Err(); e != nil {
		return nil, 0, nil, e
	}
	var next *string
	if len(result) > q.Limit {
		next = Ptr(s.encodeCursor(keys[q.Limit-1]))
		result = result[:q.Limit]
	}
	return result, total, next, nil
}

// dateWhere uses normalized UTC timestamps; from is inclusive and to exclusive.
func dateWhere(key string, q Query, where string, args []any) (string, []any) {
	if q.From != "" {
		args = append(args, q.From)
		where += fmt.Sprintf(" AND %s >= $%d", key, len(args)+1)
	}
	if q.To != "" {
		args = append(args, q.To)
		where += fmt.Sprintf(" AND %s < $%d", key, len(args)+1)
	}
	return where, args
}
func (s *Service) Products(ctx context.Context, t *store.Tx, q Query) (ProductPage, error) {
	where, args := dateWhere("body->>'createdAt'", q, "", []any{})
	if q.Q != "" {
		args = append(args, q.Q)
		where += fmt.Sprintf(" AND (strpos(lower(body->>'name'),lower($%d))>0 OR strpos(lower(body->>'code'),lower($%d))>0)", len(args)+1, len(args)+1)
	}
	if q.SaleType != "" {
		args = append(args, q.SaleType)
		where += fmt.Sprintf(" AND body->>'saleType'=$%d", len(args)+1)
	}
	items, total, next, e := page[Product](ctx, s, t, "products", "products", "body->>'code'", where, false, q, args)
	return ProductPage{items, total, next}, e
}
func (s *Service) Transactions(ctx context.Context, t *store.Tx, q Query) (TransactionPage, error) {
	where, args := dateWhere("body->>'receivedAt'", q, "", []any{})
	if q.Q != "" {
		args = append(args, q.Q)
		where += fmt.Sprintf(" AND (strpos(lower(body->>'note'),lower($%d))>0 OR strpos(lower(body->>'senderName'),lower($%d))>0)", len(args)+1, len(args)+1)
	}
	items, total, next, err := page[BankPayment](ctx, s, t, "payments", "transactions", "body->>'receivedAt'", where, true, q, args)
	return TransactionPage{items, total, next}, err
}
func (s *Service) Orders(ctx context.Context, t *store.Tx, q Query, search bool) (OrderPage, error) {
	where, args := dateWhere("body->>'createdAt'", q, "", []any{})
	key := "body->>'createdAt'"
	desc := false
	endpoint := "orders"
	if search {
		endpoint = "orders/search"
		switch q.View {
		case "all":
			desc = true
		case "awaiting_payment", "needs_review":
			args = append(args, q.View)
			where += fmt.Sprintf(" AND body->>'status'=$%d", len(args)+1)
			desc = true
		case "to_fulfill":
			where += " AND body->>'status'='paid' AND body->>'fulfilledAt' IS NULL"
			key = "body->>'paidAt'"
		case "fulfilled":
			where += " AND body->>'status'='paid' AND body->>'fulfilledAt' IS NOT NULL"
			key = "body->>'fulfilledAt'"
			desc = true
		case "cancelled":
			where += " AND body->>'status'='cancelled'"
			key = "body->>'cancelledAt'"
			desc = true
		default:
			return OrderPage{}, Invalid()
		}
	}
	if q.Q != "" {
		args = append(args, q.Q)
		n := len(args) + 1
		where += fmt.Sprintf(" AND (strpos(lower(body->>'customerName'),lower($%d))>0 OR strpos(body->>'code',$%d)>0 OR strpos(body->>'customerPhone',$%d)>0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(body->'items') i WHERE strpos(lower(i->>'productName'),lower($%d))>0))", n, n, n, n)
	}
	items, total, next, e := page[Order](ctx, s, t, "orders", endpoint, key, where, desc, q, args)
	return OrderPage{items, total, next}, e
}
func (s *Service) Cases(ctx context.Context, t *store.Tx, q Query) (ReviewCasePage, error) {
	where, args := dateWhere("body->'payment'->>'receivedAt'", q, "", []any{})
	items, total, next, e := page[ReviewCase](ctx, s, t, "review_cases", "review/cases", "body->'payment'->>'receivedAt'", where, true, q, args)
	return ReviewCasePage{items, total, next}, e
}
func (s *Service) Preorder(ctx context.Context, t *store.Tx, id string, q Query) (PreorderDetail, error) {
	p, e := s.Product(ctx, t, id)
	if e != nil {
		return PreorderDetail{}, e
	}
	if p.Preorder == nil {
		return PreorderDetail{}, NotFound()
	}
	where := " AND EXISTS(SELECT 1 FROM jsonb_array_elements(body->'items') i WHERE i->>'productId'=$2)"
	where, args := dateWhere("body->>'createdAt'", q, where, []any{id})
	orders, total, next, e := page[Order](ctx, s, t, "orders", "preorder/"+id, "body->>'createdAt'", where, true, q, args)
	if e != nil {
		return PreorderDetail{}, e
	}
	result := PreorderDetail{p, []PreorderTallyRow{}, orders, total, next}
	if len(p.Variants) == 0 {
		result.Tally = append(result.Tally, PreorderTallyRow{})
	} else {
		for _, v := range p.Variants {
			result.Tally = append(result.Tally, PreorderTallyRow{VariantName: Ptr(v.Name)})
		}
	}
	rows, e := t.Query(ctx, `SELECT i->>'variantName',sum((i->>'quantity')::bigint),coalesce(sum((i->>'quantity')::bigint) FILTER(WHERE o.body->>'status'='paid'),0)
 FROM orders o CROSS JOIN LATERAL jsonb_array_elements(o.body->'items') i
 WHERE o.shop_id=$1 AND o.body->>'status'<>'cancelled' AND i->>'productId'=$2 GROUP BY i->>'variantName'`, t.ShopID, id)
	if e != nil {
		return result, e
	}
	defer rows.Close()
	for rows.Next() {
		var name *string
		var ordered, paid int64
		if e = rows.Scan(&name, &ordered, &paid); e != nil {
			return result, e
		}
		found := false
		for i := range result.Tally {
			if same(result.Tally[i].VariantName, name) {
				result.Tally[i].Ordered = ordered
				result.Tally[i].Paid = paid
				found = true
			}
		}
		if !found {
			result.Tally = append(result.Tally, PreorderTallyRow{name, ordered, paid})
		}
	}
	return result, rows.Err()
}
func (s *Service) ReviewSummary(ctx context.Context, t *store.Tx) (ReviewSummary, error) {
	var r ReviewSummary
	e := t.QueryRow(ctx, `SELECT count(*) FILTER(WHERE body->>'status'='open'),count(*) FILTER(WHERE body->>'status'='waiting_buyer'),count(*) FILTER(WHERE body->'refund'->>'status'='pending') FROM review_cases WHERE shop_id=$1`, t.ShopID).Scan(&r.Open, &r.Waiting, &r.RefundsPending)
	return r, e
}
func (s *Service) Report(ctx context.Context, t *store.Tx, q Query) (ReportSummary, error) {
	r := ReportSummary{From: string(q.From), To: string(q.To)}
	r.ByChannel = make([]struct {
		Channel Channel `json:"channel"`
		Count   int64   `json:"count"`
	}, 0)
	r.TopProducts = make([]struct {
		ProductID string `json:"productId"`
		Name      string `json:"name"`
		Quantity  int64  `json:"quantity"`
		Revenue   Money  `json:"revenue"`
	}, 0)
	where := "shop_id=$1 AND body->>'createdAt'>=$2 AND body->>'createdAt'<$3"
	args := []any{t.ShopID, q.From, q.To}
	e := t.QueryRow(ctx, "SELECT coalesce(sum((body->>'total')::bigint) FILTER(WHERE body->>'status'='paid'),0),count(*) FILTER(WHERE body->>'status'='paid'),count(*) FILTER(WHERE body->>'status'='awaiting_payment') FROM orders WHERE "+where, args...).Scan(&r.Revenue, &r.PaidCount, &r.AwaitingCount)
	if e != nil {
		return r, e
	}
	e = t.QueryRow(ctx, "SELECT count(*) FROM payments WHERE shop_id=$1 AND body->>'receivedAt'>=$2 AND body->>'receivedAt'<$3 AND order_id IS NULL", args...).Scan(&r.UnmatchedPaymentCount)
	if e != nil {
		return r, e
	}
	rows, e := t.Query(ctx, "SELECT body->>'channel',count(*) FROM orders WHERE "+where+" AND body->>'status'='paid' GROUP BY body->>'channel' ORDER BY body->>'channel'", args...)
	if e != nil {
		return r, e
	}
	for rows.Next() {
		v := struct {
			Channel Channel `json:"channel"`
			Count   int64   `json:"count"`
		}{}
		if e = rows.Scan(&v.Channel, &v.Count); e != nil {
			rows.Close()
			return r, e
		}
		r.ByChannel = append(r.ByChannel, v)
	}
	e = rows.Err()
	rows.Close()
	if e != nil {
		return r, e
	}
	rows, e = t.Query(ctx, `SELECT i->>'productId',max(i->>'productName'),sum((i->>'quantity')::bigint),sum((i->>'quantity')::bigint*(i->>'unitPrice')::bigint) FROM orders CROSS JOIN LATERAL jsonb_array_elements(body->'items') i WHERE `+where+` AND body->>'status'='paid' GROUP BY i->>'productId' ORDER BY 4 DESC,1 ASC LIMIT 5`, args...)
	if e != nil {
		return r, e
	}
	defer rows.Close()
	for rows.Next() {
		v := struct {
			ProductID string `json:"productId"`
			Name      string `json:"name"`
			Quantity  int64  `json:"quantity"`
			Revenue   Money  `json:"revenue"`
		}{}
		if e = rows.Scan(&v.ProductID, &v.Name, &v.Quantity, &v.Revenue); e != nil {
			return r, e
		}
		r.TopProducts = append(r.TopProducts, v)
	}
	return r, rows.Err()
}
func (s *Service) Today(ctx context.Context, t *store.Tx) (TodaySummary, error) {
	loc, e := time.LoadLocation("Asia/Ulaanbaatar")
	if e != nil {
		return TodaySummary{}, e
	}
	now := time.Now().In(loc)
	from := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
	r, e := s.Report(ctx, t, Query{From: Stamp(from), To: Stamp(from.AddDate(0, 0, 1))})
	if e != nil {
		return TodaySummary{}, e
	}
	review, e := s.ReviewSummary(ctx, t)
	if e != nil {
		return TodaySummary{}, e
	}
	recent, e := store.Select[Order](ctx, t, "orders", "", "coalesce(body->>'paidAt',body->>'createdAt') DESC,id DESC LIMIT 10")
	return TodaySummary{r.Revenue, r.PaidCount, r.AwaitingCount, review.Open, recent}, e
}

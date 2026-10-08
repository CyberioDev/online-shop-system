package shop

import (
	"context"
	"encoding/json"
	"errors"
	"regexp"
	"strings"

	"github.com/jackc/pgx/v5"
	"online-shop/backend/internal/store"
	"time"
)

var codeRE = regexp.MustCompile(`\b\d{4}\b`)

type PaymentResult struct {
	Payment    BankPayment `json:"payment"`
	Order      *Order      `json:"order"`
	ReviewCase *ReviewCase `json:"reviewCase"`
}

func (s *Service) Payment(ctx context.Context, t *store.Tx, in PaymentInput) (PaymentResult, error) {
	var result PaymentResult
	at, e := time.Parse(time.RFC3339Nano, in.ReceivedAt)
	if e != nil || in.Amount < 1 || in.Amount > 9_000_000_000_000_000 || !textOK(in.ExternalID, 1, 200) || !textOK(in.Bank, 1, 80) || !textOK(in.SenderName, 0, 200) || !textOK(in.Note, 0, 1000) || len(in.RawMessage) > 10000 {
		return result, Invalid()
	}
	p := BankPayment{ID: ID(), Amount: Money(in.Amount), SenderName: in.SenderName, Note: in.Note, Bank: in.Bank, ReceivedAt: Stamp(at), RawMessage: in.RawMessage}
	raw, _ := json.Marshal(p)
	_, e = t.Exec(ctx, "INSERT INTO payments(shop_id,id,external_id,body) VALUES($1,$2,$3,$4)", t.ShopID, p.ID, in.ExternalID, raw)
	if e != nil {
		return result, e
	}
	result.Payment = p
	codes := codeRE.FindAllString(in.Note, -1)
	unique := map[string]bool{}
	for _, code := range codes {
		unique[code] = true
	}
	var candidates []Order
	if len(unique) == 1 {
		for code := range unique {
			candidates, e = store.Select[Order](ctx, t, "orders", " AND body->>'code'=$2 AND body->>'status'='awaiting_payment'", "id", code)
			if e != nil {
				return result, e
			}
		}
	}
	if len(candidates) == 1 && candidates[0].Total == p.Amount {
		o := candidates[0]
		if e = s.markPaid(ctx, t, &o, p, "auto"); e != nil {
			return result, e
		}
		result.Order = &o
		if e = s.paymentEvent(ctx, t, p, o); e != nil {
			return result, e
		}
		return result, nil
	}
	reason := "no_code"
	if len(candidates) == 1 {
		reason = "amount_mismatch"
	} else if len(unique) > 0 {
		reason = "code_typo"
	}
	c := ReviewCase{ID: ID(), Payment: p, Reason: reason, Status: "open", Candidates: []MatchCandidate{}}
	if len(candidates) == 1 {
		candidate := candidateFor(candidates[0], p)
		c.Suggestion = &candidate
		candidates[0].Status = "needs_review"
		if e = t.Put(ctx, "orders", candidates[0].ID, candidates[0]); e != nil {
			return result, e
		}
	}
	if c.Suggestion == nil && len(unique) == 1 {
		for code := range unique {
			var paid bool
			e = t.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM orders WHERE shop_id=$1 AND body->>'code'=$2 AND body->>'status'='paid')", t.ShopID, code).Scan(&paid)
			if e != nil {
				return result, e
			}
			if paid {
				c.Reason = "duplicate"
			}
		}
	}
	if e = t.Put(ctx, "review_cases", c.ID, c); e != nil {
		return result, e
	}
	result.ReviewCase = &c
	e = t.Enqueue(ctx, ID(), "payment.needs_review", result)
	return result, e
}
func (s *Service) markPaid(ctx context.Context, t *store.Tx, o *Order, p BankPayment, by string) error {
	if o.Status != "awaiting_payment" && o.Status != "needs_review" {
		return Conflict()
	}
	// An order reserved by another unresolved payment cannot be matched again.
	var other bool
	e := t.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM review_cases WHERE shop_id=$1 AND body->>'status'<>'resolved' AND body->'suggestion'->'order'->>'id'=$2 AND body->'payment'->>'id'<>$3)", t.ShopID, o.ID, p.ID).Scan(&other)
	if e != nil {
		return e
	}
	if other {
		return Conflict()
	}
	o.Status = "paid"
	o.PaidAt = &p.ReceivedAt
	o.MatchedBy = &by
	for _, item := range o.Items {
		product, e := s.Product(ctx, t, item.ProductID)
		if e != nil {
			var de *Error
			if errors.As(e, &de) && de.Status == 404 {
				continue
			}
			return e
		}
		if product.Preorder != nil {
			product.Preorder.Paid += item.Quantity
			if e = t.Put(ctx, "products", product.ID, product); e != nil {
				return e
			}
		}
	}
	if e = t.Put(ctx, "orders", o.ID, o); e != nil {
		return e
	}
	_, e = t.Exec(ctx, "UPDATE payments SET order_id=$3 WHERE shop_id=$1 AND id=$2", t.ShopID, p.ID, o.ID)
	return e
}
func candidateFor(o Order, p BankPayment) MatchCandidate {
	signals := []MatchSignal{}
	level := "warn"
	if o.Total == p.Amount {
		level = "ok"
	}
	signals = append(signals, MatchSignal{level, "Дүн: захиалга болон төлбөрийн дүнг шалгана уу"})
	if strings.Contains(p.Note, o.Code) {
		signals = append(signals, MatchSignal{"ok", "Код: таарч байна"})
	}
	return MatchCandidate{o, signals, "Код болон дүнг шалгана уу"}
}
func (s *Service) Case(ctx context.Context, t *store.Tx, id string) (ReviewCase, error) {
	c, e := get[ReviewCase](ctx, t, "review_cases", id)
	if e != nil {
		return c, e
	}
	if c.Suggestion != nil {
		o, err := s.Order(ctx, t, c.Suggestion.Order.ID)
		if err == nil {
			v := candidateFor(o, c.Payment)
			c.Suggestion = &v
		} else {
			var de *Error
			if !errors.As(err, &de) || de.Status != 404 {
				return c, err
			}
			c.Suggestion = nil
		}
	}
	candidates, e := s.Candidates(ctx, t, c, "")
	if e != nil {
		return c, e
	}
	c.Candidates = []MatchCandidate{}
	for _, v := range candidates {
		if c.Suggestion != nil && c.Suggestion.Order.ID == v.Order.ID {
			continue
		}
		c.Candidates = append(c.Candidates, v)
		if len(c.Candidates) == 4 {
			break
		}
	}
	return c, nil
}
func (s *Service) Candidates(ctx context.Context, t *store.Tx, c ReviewCase, q string) ([]MatchCandidate, error) {
	if len(q) > 200 {
		return nil, Invalid()
	}
	orders, e := store.Select[Order](ctx, t, "orders", ` AND body->>'status'<>'cancelled' AND ($2='' OR strpos(lower(body->>'customerName'),lower($2))>0 OR strpos(body->>'code',$2)>0 OR starts_with(body->>'total',$2))`,
		`(body->>'code' = $3) DESC,((body->>'total')::bigint=$4) DESC,body->>'createdAt' DESC,id DESC LIMIT 10`, q, codeRE.FindString(c.Payment.Note), int64(c.Payment.Amount))
	if e != nil {
		return nil, e
	}
	result := []MatchCandidate{}
	for _, o := range orders {
		result = append(result, candidateFor(o, c.Payment))
	}
	return result, nil
}

type orderUndo struct {
	Before Order `json:"before"`
	After  Order `json:"after"`
}

func (s *Service) Resolve(ctx context.Context, t *store.Tx, id string, in ResolveCaseInput) (ReviewCase, error) {
	c, e := s.Case(ctx, t, id)
	if e != nil {
		return c, e
	}
	if c.Status == "resolved" {
		return c, Conflict()
	}
	if in.Note != nil && !textOK(*in.Note, 0, 1000) {
		return c, Invalid()
	}
	undo := []orderUndo{}
	resolution := CaseResolution{Kind: in.Kind, ResolvedAt: Now()}
	c.Refund = nil
	switch in.Kind {
	case "matched":
		o, e := s.Order(ctx, t, in.OrderID)
		if e != nil {
			return c, e
		}
		before := o
		difference := int64(c.Payment.Amount - o.Total)
		if difference == 0 && in.DifferenceAction != nil || difference > 0 && (in.DifferenceAction == nil || *in.DifferenceAction != "refund" && *in.DifferenceAction != "keep") || difference < 0 && (in.DifferenceAction == nil || *in.DifferenceAction != "accept_short") {
			return c, Invalid()
		}
		if e = s.markPaid(ctx, t, &o, c.Payment, "manual"); e != nil {
			return c, e
		}
		undo = append(undo, orderUndo{before, o})
		resolution.OrderID = o.ID
		resolution.OrderCode = o.Code
		resolution.CustomerName = o.CustomerName
		resolution.Difference = difference
		resolution.DifferenceAction = in.DifferenceAction
		if difference > 0 && *in.DifferenceAction == "refund" {
			c.Refund = &CaseRefund{Amount: Money(difference), Status: "pending"}
		}
	case "no_order":
		if in.Category != "refund" && in.Category != "other_income" {
			return c, Invalid()
		}
		resolution.Category = in.Category
		if in.Category == "refund" {
			c.Refund = &CaseRefund{Amount: c.Payment.Amount, Status: "pending"}
		}
	default:
		return c, Invalid()
	}
	if c.Suggestion != nil && (in.Kind != "matched" || c.Suggestion.Order.ID != in.OrderID) {
		o, e := s.Order(ctx, t, c.Suggestion.Order.ID)
		if e != nil {
			return c, e
		}
		if o.Status == "needs_review" {
			before := o
			o.Status = "awaiting_payment"
			if e = t.Put(ctx, "orders", o.ID, o); e != nil {
				return c, e
			}
			undo = append(undo, orderUndo{before, o})
		}
	}
	c.Status = "resolved"
	c.Resolution = &resolution
	c.Note = in.Note
	if e = t.Put(ctx, "review_cases", id, c); e != nil {
		return c, e
	}
	raw, _ := json.Marshal(undo)
	_, e = t.Exec(ctx, "UPDATE review_cases SET undo=$3 WHERE shop_id=$1 AND id=$2", t.ShopID, id, raw)
	if e != nil {
		return c, e
	}
	if in.Kind == "matched" {
		e = s.paymentEvent(ctx, t, c.Payment, undo[0].After)
	} else {
		e = t.Enqueue(ctx, ID(), "payment.resolved_without_order", map[string]any{"payment": c.Payment, "category": in.Category})
	}
	return c, e
}
func (s *Service) Contact(ctx context.Context, t *store.Tx, id, orderID, message string) (ReviewCase, error) {
	c, e := s.Case(ctx, t, id)
	if e != nil {
		return c, e
	}
	if c.Status == "resolved" {
		return c, Conflict()
	}
	if !textOK(message, 1, 1000) {
		return c, Invalid()
	}
	o, e := s.Order(ctx, t, orderID)
	if e != nil {
		return c, e
	}
	var conversation string
	e = t.QueryRow(ctx, "SELECT conversation_id FROM orders WHERE shop_id=$1 AND id=$2", t.ShopID, orderID).Scan(&conversation)
	if e != nil {
		return c, e
	}
	if conversation == "" {
		return c, Invalid()
	}
	if ok, err := s.HasTarget(ctx, t, "chatbot"); err != nil {
		return c, err
	} else if !ok {
		return c, Unavailable()
	}
	c.Contact = &CaseContact{OrderID: orderID, CustomerName: o.CustomerName, Message: message, SentAt: Now()}
	c.Status = "waiting_buyer"
	if e = t.Enqueue(ctx, ID(), "buyer.contact_requested", map[string]any{"orderId": orderID, "conversationId": conversation, "message": message}); e != nil {
		return c, e
	}
	return c, t.Put(ctx, "review_cases", id, c)
}
func (s *Service) Refunded(ctx context.Context, t *store.Tx, id string) (ReviewCase, error) {
	c, e := s.Case(ctx, t, id)
	if e != nil {
		return c, e
	}
	if c.Refund == nil || c.Refund.Status != "pending" {
		return c, Conflict()
	}
	c.Refund.Status = "done"
	c.Refund.DoneAt = Ptr(Now())
	return c, t.Put(ctx, "review_cases", id, c)
}
func (s *Service) Reopen(ctx context.Context, t *store.Tx, id string) (ReviewCase, error) {
	c, e := s.Case(ctx, t, id)
	if e != nil {
		return c, e
	}
	if c.Status != "resolved" || c.Refund != nil && c.Refund.Status == "done" {
		return c, Conflict()
	}
	var raw []byte
	if e = t.QueryRow(ctx, "SELECT undo FROM review_cases WHERE shop_id=$1 AND id=$2", t.ShopID, id).Scan(&raw); e != nil {
		return c, e
	}
	var undo []orderUndo
	if len(raw) > 0 {
		if e = json.Unmarshal(raw, &undo); e != nil {
			return c, e
		}
	}
	for _, u := range undo {
		o, e := s.Order(ctx, t, u.Before.ID)
		if e != nil {
			return c, e
		}
		a, _ := json.Marshal(o)
		b, _ := json.Marshal(u.After)
		if string(a) != string(b) {
			return c, Conflict()
		}
		if u.Before.PaidAt == nil && u.After.PaidAt != nil {
			for _, item := range o.Items {
				p, err := s.Product(ctx, t, item.ProductID)
				if err != nil {
					var de *Error
					if errors.As(err, &de) && de.Status == 404 {
						continue
					}
					return c, err
				}
				if p.Preorder != nil {
					p.Preorder.Paid -= item.Quantity
					if e = t.Put(ctx, "products", p.ID, p); e != nil {
						return c, e
					}
				}
			}
		}
		if e = t.Put(ctx, "orders", o.ID, u.Before); e != nil {
			return c, e
		}
	}
	_, e = t.Exec(ctx, "UPDATE payments SET order_id=NULL WHERE shop_id=$1 AND id=$2", t.ShopID, c.Payment.ID)
	if e != nil {
		return c, e
	}
	c.Status = "open"
	if c.Contact != nil {
		c.Status = "waiting_buyer"
	}
	c.Resolution = nil
	c.Refund = nil
	if e = t.Put(ctx, "review_cases", id, c); e != nil {
		return c, e
	}
	e = t.Enqueue(ctx, ID(), "payment.reopened", map[string]any{"payment": c.Payment, "caseId": c.ID})
	return c, e
}

// Idempotent binds the key to the complete payload. Replays return the original
// result, and a changed payload with the same key is rejected atomically.
func Idempotent[T any](ctx context.Context, t *store.Tx, scope, key string, input any, fn func() (T, error)) (T, error) {
	var result T
	if !textOK(key, 1, 200) {
		return result, Invalid()
	}
	raw, e := json.Marshal(input)
	if e != nil {
		return result, e
	}
	hash := Hash(string(raw))
	var oldHash string
	var old []byte
	e = t.QueryRow(ctx, "SELECT request_hash,response FROM idempotency WHERE shop_id=$1 AND scope=$2 AND key=$3", t.ShopID, scope, key).Scan(&oldHash, &old)
	if e == nil {
		if oldHash != hash {
			return result, Conflict()
		}
		e = json.Unmarshal(old, &result)
		return result, e
	}
	if !errors.Is(e, pgx.ErrNoRows) {
		return result, e
	}
	result, e = fn()
	if e != nil {
		return result, e
	}
	raw, e = json.Marshal(result)
	if e != nil {
		return result, e
	}
	_, e = t.Exec(ctx, "INSERT INTO idempotency(shop_id,scope,key,request_hash,response) VALUES($1,$2,$3,$4,$5)", t.ShopID, scope, key, hash, raw)
	return result, e
}

func (s *Service) paymentEvent(ctx context.Context, t *store.Tx, p BankPayment, o Order) error {
	var conversation string
	if err := t.QueryRow(ctx, "SELECT conversation_id FROM orders WHERE shop_id=$1 AND id=$2", t.ShopID, o.ID).Scan(&conversation); err != nil {
		return err
	}
	return t.Enqueue(ctx, ID(), "payment.matched", map[string]any{"payment": p, "order": o, "conversationId": conversation})
}

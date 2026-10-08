package shop

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"online-shop/backend/internal/store"
)

type Error struct {
	Status        int
	Code, Message string
}

func (e *Error) Error() string { return e.Message }
func Invalid() error {
	return &Error{422, "validation", "Оруулсан мэдээллээ шалгана уу."}
}
func Conflict() error {
	return &Error{409, "conflict", "Мэдээллийн төлөв өөрчлөгдсөн эсвэл үйлдэл боломжгүй байна."}
}
func Unauthorized() error {
	return &Error{401, "unauthorized", "Нэвтрэх эрх дууссан байна."}
}
func Unavailable() error {
	return &Error{503, "unavailable", "Холболтын үйлчилгээ түр боломжгүй байна."}
}
func NotFound() error { return &Error{404, "not_found", "Мэдээлэл олдсонгүй."} }
func ID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b[:])
}
func Hash(s string) string { b := sha256.Sum256([]byte(s)); return hex.EncodeToString(b[:]) }
func Now() Timestamp       { return Stamp(time.Now()) }

// Fixed-width UTC timestamps preserve chronological order in JSONB text indexes.
func Stamp(t time.Time) Timestamp { return Timestamp(t.UTC().Format("2006-01-02T15:04:05.000000000Z")) }
func Ptr[T any](v T) *T           { return &v }
func textOK(s string, min, max int) bool {
	n := utf8.RuneCountInString(strings.TrimSpace(s))
	return n >= min && n <= max
}

var phoneRE = regexp.MustCompile(`^\d{8}$`)
var productCodeRE = regexp.MustCompile(`^[A-Z]{3}$`)
var accountRE = regexp.MustCompile(`^(MN\d{18}|\d{8,20})$`)

func same(a, b *string) bool { return a == nil && b == nil || a != nil && b != nil && *a == *b }
func validURL(s string) bool {
	u, e := url.Parse(s)
	return e == nil && (u.Scheme == "https" || u.Scheme == "http") && u.Host != "" && u.User == nil
}
func get[T any](ctx context.Context, t *store.Tx, table, id string) (T, error) {
	var v T
	e := t.Get(ctx, table, id, &v)
	if errors.Is(e, pgx.ErrNoRows) {
		e = NotFound()
	}
	return v, e
}

type Service struct {
	DB        *store.Store
	CursorKey []byte
	PublicURL string
}

func (s *Service) Read(ctx context.Context, id string, fn func(*store.Tx) error) error {
	return s.DB.Within(ctx, id, false, fn)
}
func (s *Service) Write(ctx context.Context, id string, fn func(*store.Tx) error) error {
	return s.DB.Within(ctx, id, true, fn)
}
func randomNumber(n int64) int64 {
	v, e := rand.Int(rand.Reader, big.NewInt(n))
	if e != nil {
		panic(e)
	}
	return v.Int64()
}
func (s *Service) Product(ctx context.Context, t *store.Tx, id string) (Product, error) {
	return get[Product](ctx, t, "products", id)
}
func (s *Service) Order(ctx context.Context, t *store.Tx, id string) (Order, error) {
	return get[Order](ctx, t, "orders", id)
}
func (s *Service) Settings(ctx context.Context, t *store.Tx) (ShopSettings, error) {
	v, e := get[ShopSettings](ctx, t, "settings", "shop")
	var x *Error
	if errors.As(e, &x) && x.Status == 404 {
		return ShopSettings{}, nil
	}
	return v, e
}
func (s *Service) SetBank(ctx context.Context, t *store.Tx, in BankAccount) (ShopSettings, error) {
	if !textOK(in.Bank, 1, 80) || !textOK(in.AccountHolder, 1, 120) || !accountRE.MatchString(in.AccountNumber) {
		return ShopSettings{}, Invalid()
	}
	v := ShopSettings{&in}
	return v, t.Put(ctx, "settings", "shop", v)
}
func (s *Service) SaveProduct(ctx context.Context, t *store.Tx, id string, in ProductInput) (Product, error) {
	var p Product
	var err error
	if id != "" {
		p, err = s.Product(ctx, t, id)
		if err != nil {
			return p, err
		}
		if p.SaleType != in.SaleType {
			return p, Invalid()
		}
	}
	if !textOK(in.Name, 1, 80) || in.Price < 1 || in.Price > 1_000_000_000_000 || in.Stock < 0 || in.Stock > 1_000_000_000 || in.Variants == nil || len(in.Variants) > 100 {
		return p, Invalid()
	}
	if in.ImageURL != nil && !validURL(*in.ImageURL) {
		return p, Invalid()
	}
	if in.SaleType != "stock" && in.SaleType != "preorder" {
		return p, Invalid()
	}
	if (in.SaleType == "preorder") != (in.Preorder != nil) {
		return p, Invalid()
	}
	old := map[string]string{}
	for _, v := range p.Variants {
		old[v.Name] = v.ID
	}
	variants := []ProductVariant{}
	seen := map[string]bool{}
	for _, v := range in.Variants {
		key := strings.ToLower(v.Name)
		if !textOK(v.Name, 1, 20) || seen[key] || v.Quantity < 0 || v.Quantity > 1_000_000_000 || in.SaleType == "preorder" && v.Quantity != 0 {
			return p, Invalid()
		}
		seen[key] = true
		vid := old[v.Name]
		if vid == "" {
			vid = ID()
		}
		variants = append(variants, ProductVariant{vid, v.Name, v.Quantity})
	}
	if (len(variants) > 0 || in.SaleType == "preorder") && in.Stock != 0 {
		return p, Invalid()
	}
	if id == "" {
		p.ID = ID()
		p.CreatedAt = Now()
	}
	if in.Code != nil {
		if !productCodeRE.MatchString(*in.Code) {
			return p, Invalid()
		}
		p.Code = *in.Code
		p.CodeSource = "custom"
	} else if p.CodeSource != "auto" {
		p.Code = ""
		const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ"
		for i := 0; i < 20000; i++ {
			code := string([]byte{letters[randomNumber(int64(len(letters)))], letters[randomNumber(int64(len(letters)))], letters[randomNumber(int64(len(letters)))]})
			if seen[strings.ToLower(code)] || code == "XXL" || code == "XXS" {
				continue
			}
			var exists bool
			err = t.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM products WHERE shop_id=$1 AND ((body->>'code'=$2 AND id<>$3) OR EXISTS(SELECT 1 FROM jsonb_array_elements(body->'variants') v WHERE lower(v->>'name')=lower($2))))", t.ShopID, code, p.ID).Scan(&exists)
			if err != nil {
				return p, err
			}
			if !exists {
				p.Code = code
				p.CodeSource = "auto"
				break
			}
		}
		if p.Code == "" {
			return p, Conflict()
		}
	}
	var exists bool
	if err = t.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM products WHERE shop_id=$1 AND body->>'code'=$2 AND id<>$3)", t.ShopID, p.Code, p.ID).Scan(&exists); err != nil {
		return p, err
	}
	if exists {
		return p, &Error{409, "code_taken", "Барааны код давхардсан байна."}
	}
	p.Name = in.Name
	p.Price = Money(in.Price)
	p.ImageURL = in.ImageURL
	p.SaleType = in.SaleType
	p.Stock = in.Stock
	p.Variants = variants
	if in.Preorder != nil {
		if in.Preorder.Limit != nil && *in.Preorder.Limit < 1 {
			return p, Invalid()
		}
		if in.Preorder.ClosesOn != nil {
			if _, err = time.Parse("2006-01-02", *in.Preorder.ClosesOn); err != nil {
				return p, Invalid()
			}
		}
		if p.Preorder == nil {
			p.Preorder = &PreorderInfo{Status: "open"}
		}
		p.Preorder.ClosesOn = in.Preorder.ClosesOn
		p.Preorder.ArrivalNote = in.Preorder.ArrivalNote
		p.Preorder.Limit = in.Preorder.Limit
	}
	return p, t.Put(ctx, "products", p.ID, p)
}
func (s *Service) Price(ctx context.Context, t *store.Tx, id string, price int64) (Product, error) {
	p, e := s.Product(ctx, t, id)
	if e != nil {
		return p, e
	}
	if price < 1 || price > 1_000_000_000_000 {
		return p, Invalid()
	}
	p.Price = Money(price)
	return p, t.Put(ctx, "products", id, p)
}
func (s *Service) PreorderStatus(ctx context.Context, t *store.Tx, id string, status PreorderStatus) (Product, error) {
	p, e := s.Product(ctx, t, id)
	if e != nil {
		return p, e
	}
	if p.Preorder == nil {
		return p, Conflict()
	}
	old := p.Preorder.Status
	if !(old == "open" && status == "closed" || old == "closed" && (status == "open" || status == "arrived")) {
		return p, Conflict()
	}
	if status == "arrived" {
		if ok, err := s.HasTarget(ctx, t, "chatbot"); err != nil {
			return p, err
		} else if !ok {
			return p, Unavailable()
		}
		orders, err := store.Select[Order](ctx, t, "orders", " AND body->>'status'='paid' AND EXISTS(SELECT 1 FROM jsonb_array_elements(body->'items') i WHERE i->>'productId'=$2)", "id", id)
		if err != nil {
			return p, err
		}
		for _, o := range orders {
			var conversation string
			if err = t.QueryRow(ctx, "SELECT conversation_id FROM orders WHERE shop_id=$1 AND id=$2", t.ShopID, o.ID).Scan(&conversation); err != nil {
				return p, err
			}
			if err = t.Enqueue(ctx, ID(), "preorder.arrived", map[string]any{"productId": id, "orderId": o.ID, "conversationId": conversation}); err != nil {
				return p, err
			}
		}
	}
	p.Preorder.Status = status
	return p, t.Put(ctx, "products", id, p)
}
func (s *Service) CreateOrder(ctx context.Context, t *store.Tx, in CreateOrderInput) (Order, error) {
	o := Order{ID: ID(), CustomerName: in.CustomerName, Channel: in.Channel, CustomerPhone: in.CustomerPhone, DeliveryAddress: in.DeliveryAddress, ChatURL: in.ChatURL, Status: "awaiting_payment", CreatedAt: Now(), Items: []OrderItem{}}
	if !textOK(in.CustomerName, 1, 120) || len(in.Items) < 1 || len(in.Items) > 100 || len(in.ConversationID) > 500 || in.CustomerPhone != nil && !phoneRE.MatchString(*in.CustomerPhone) || in.DeliveryAddress != nil && !textOK(*in.DeliveryAddress, 0, 300) || in.ChatURL != nil && !validURL(*in.ChatURL) {
		return o, Invalid()
	}
	switch in.Channel {
	case "live", "messenger", "instagram", "facebook":
	default:
		return o, Invalid()
	}
	settings, e := s.Settings(ctx, t)
	if e != nil {
		return o, e
	}
	if settings.BankAccount == nil {
		return o, Conflict()
	}
	// Choose from the entire remaining code space to avoid spurious collisions.
	rows, e := t.Query(ctx, "SELECT body->>'code' FROM orders WHERE shop_id=$1 AND body->>'status' IN ('awaiting_payment','needs_review')", t.ShopID)
	if e != nil {
		return o, e
	}
	used := map[string]bool{}
	for rows.Next() {
		var code string
		if e = rows.Scan(&code); e != nil {
			rows.Close()
			return o, e
		}
		used[code] = true
	}
	e = rows.Err()
	rows.Close()
	if e != nil {
		return o, e
	}
	start := int(randomNumber(9000))
	for i := 0; i < 9000; i++ {
		code := fmt.Sprintf("%04d", 1000+(start+i)%9000)
		if !used[code] {
			o.Code = code
			break
		}
	}
	if o.Code == "" {
		return o, Conflict()
	}
	for _, item := range in.Items {
		if item.Quantity < 1 || item.Quantity > 1_000_000 {
			return o, Invalid()
		}
		p, e := s.Product(ctx, t, item.ProductID)
		if e != nil {
			return o, e
		}
		if p.Preorder != nil {
			if p.Preorder.Status != "open" {
				return o, Conflict()
			}
			if p.Preorder.ClosesOn != nil {
				loc, _ := time.LoadLocation("Asia/Ulaanbaatar")
				if time.Now().In(loc).Format("2006-01-02") > *p.Preorder.ClosesOn {
					return o, Conflict()
				}
			}
			if p.Preorder.Limit != nil && p.Preorder.Ordered+item.Quantity > *p.Preorder.Limit {
				return o, Conflict()
			}
		}
		oi := OrderItem{p.ID, p.Name, item.VariantName, item.Quantity, p.Price}
		if e = adjustProduct(&p, oi, -1, false); e != nil {
			return o, e
		}
		if p.Preorder != nil && p.Preorder.Limit != nil && p.Preorder.Ordered >= *p.Preorder.Limit {
			p.Preorder.Status = "closed"
		}
		if e = t.Put(ctx, "products", p.ID, p); e != nil {
			return o, e
		}
		if int64(p.Price) > (9_000_000_000_000_000-int64(o.Total))/item.Quantity {
			return o, Invalid()
		}
		o.Total += p.Price * Money(item.Quantity)
		o.Items = append(o.Items, oi)
	}
	if e = t.Put(ctx, "orders", o.ID, o); e != nil {
		return o, e
	}
	_, e = t.Exec(ctx, "UPDATE orders SET conversation_id=$3 WHERE shop_id=$1 AND id=$2", t.ShopID, o.ID, in.ConversationID)
	return o, e
}

// delta=-1 reserves stock; +1 releases it. Preorder counters track active demand.
func adjustProduct(p *Product, item OrderItem, delta int64, paid bool) error {
	index := -1
	if len(p.Variants) == 0 {
		if item.VariantName != nil {
			return Invalid()
		}
	} else {
		for i, v := range p.Variants {
			if item.VariantName != nil && v.Name == *item.VariantName {
				index = i
				break
			}
		}
		if index < 0 {
			return Invalid()
		}
	}
	if p.Preorder != nil {
		p.Preorder.Ordered -= delta * item.Quantity
		if paid {
			p.Preorder.Paid -= delta * item.Quantity
		}
		return nil
	}
	if index < 0 {
		p.Stock += delta * item.Quantity
		if p.Stock < 0 {
			return Conflict()
		}
	} else {
		p.Variants[index].Quantity += delta * item.Quantity
		if p.Variants[index].Quantity < 0 {
			return Conflict()
		}
	}
	return nil
}
func (s *Service) adjustOrderStock(ctx context.Context, t *store.Tx, o Order, delta int64) error {
	for _, item := range o.Items {
		p, e := s.Product(ctx, t, item.ProductID)
		if e != nil {
			var de *Error
			if delta > 0 && errors.As(e, &de) && de.Status == 404 {
				continue
			}
			return e
		}
		if e = adjustProduct(&p, item, delta, o.PaidAt != nil); e != nil {
			return e
		}
		if e = t.Put(ctx, "products", p.ID, p); e != nil {
			return e
		}
	}
	return nil
}
func (s *Service) Fulfill(ctx context.Context, t *store.Tx, ids []string, fulfilled bool) ([]Order, error) {
	if len(ids) < 1 || len(ids) > 200 {
		return nil, Invalid()
	}
	result := []Order{}
	seen := map[string]bool{}
	for _, id := range ids {
		if seen[id] {
			return nil, Invalid()
		}
		seen[id] = true
		o, e := s.Order(ctx, t, id)
		if e != nil {
			return nil, e
		}
		if o.Status != "paid" {
			return nil, Conflict()
		}
		if fulfilled {
			if o.FulfilledAt == nil {
				o.FulfilledAt = Ptr(Now())
			}
		} else {
			o.FulfilledAt = nil
		}
		if e = t.Put(ctx, "orders", id, o); e != nil {
			return nil, e
		}
		result = append(result, o)
	}
	return result, nil
}
func (s *Service) Cancel(ctx context.Context, t *store.Tx, id string, reason *string) (Order, error) {
	o, e := s.Order(ctx, t, id)
	if e != nil {
		return o, e
	}
	if reason != nil && !textOK(*reason, 0, 200) {
		return o, Invalid()
	}
	if o.Status == "cancelled" || o.Status == "needs_review" {
		return o, Conflict()
	}
	if e = s.adjustOrderStock(ctx, t, o, 1); e != nil {
		return o, e
	}
	o.Status = "cancelled"
	o.CancelledAt = Ptr(Now())
	o.CancelReason = reason
	o.FulfilledAt = nil
	return o, t.Put(ctx, "orders", id, o)
}
func (s *Service) Restore(ctx context.Context, t *store.Tx, id string) (Order, error) {
	o, e := s.Order(ctx, t, id)
	if e != nil {
		return o, e
	}
	if o.Status != "cancelled" {
		return o, Conflict()
	}
	if o.PaidAt == nil {
		var used bool
		e = t.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM orders WHERE shop_id=$1 AND body->>'code'=$2 AND body->>'status' IN ('awaiting_payment','needs_review'))", t.ShopID, o.Code).Scan(&used)
		if e != nil {
			return o, e
		}
		if used {
			return o, Conflict()
		}
	}
	if e = s.adjustOrderStock(ctx, t, o, -1); e != nil {
		return o, e
	}
	o.Status = "awaiting_payment"
	if o.PaidAt != nil {
		o.Status = "paid"
	}
	o.CancelledAt = nil
	o.CancelReason = nil
	return o, t.Put(ctx, "orders", id, o)
}
func (s *Service) UpdateOrder(ctx context.Context, t *store.Tx, id string, fields map[string]json.RawMessage) (Order, error) {
	o, e := s.Order(ctx, t, id)
	if e != nil {
		return o, e
	}
	for k, raw := range fields {
		switch k {
		case "customerPhone", "deliveryAddress", "sellerNote":
			var v *string
			if json.Unmarshal(raw, &v) != nil {
				return o, Invalid()
			}
			switch k {
			case "customerPhone":
				if v != nil && !phoneRE.MatchString(*v) {
					return o, Invalid()
				}
				o.CustomerPhone = v
			case "deliveryAddress":
				if v != nil && !textOK(*v, 0, 300) {
					return o, Invalid()
				}
				o.DeliveryAddress = v
			case "sellerNote":
				if v != nil && !textOK(*v, 0, 500) {
					return o, Invalid()
				}
				o.SellerNote = v
			}
		case "itemVariants":
			var names []*string
			if json.Unmarshal(raw, &names) != nil || len(names) != len(o.Items) || o.Status == "cancelled" {
				return o, Invalid()
			}
			for i, name := range names {
				if same(name, o.Items[i].VariantName) {
					continue
				}
				p, e := s.Product(ctx, t, o.Items[i].ProductID)
				if e != nil {
					return o, e
				}
				if e = adjustProduct(&p, o.Items[i], 1, o.PaidAt != nil); e != nil {
					return o, e
				}
				o.Items[i].VariantName = name
				if e = adjustProduct(&p, o.Items[i], -1, o.PaidAt != nil); e != nil {
					return o, e
				}
				if e = t.Put(ctx, "products", p.ID, p); e != nil {
					return o, e
				}
			}
		default:
			return o, Invalid()
		}
	}
	return o, t.Put(ctx, "orders", id, o)
}

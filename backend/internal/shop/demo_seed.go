package shop

import (
	"context"
	"encoding/json"
	"fmt"
	"math/rand"
	"time"

	"online-shop/backend/internal/store"
)

var demoCustomers = []string{
	"Туяа", "Сараа", "Мөнхөө", "Болд", "Оюука", "Тэмүүлэн", "Энхжин", "Ганбат", "Номин", "Анужин",
	"Бат-Эрдэнэ", "Золзаяа", "Хулан", "Төгөлдөр", "Мишээл", "Ариунаа", "Билгүүн", "Наранцэцэг", "Сэлэнгэ", "Дөлгөөн",
}

var demoDistricts = []string{"БЗД", "СБД", "ХУД", "СХД", "ЧД", "БГД"}

// seedDemoShop is enabled only for the local demo-shop bootstrap. Its marker and
// the fixtures are written in the same shop transaction, making startup retries safe.
func seedDemoShop(ctx context.Context, t *store.Tx) error {
	var seeded bool
	if err := t.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM demo_seeded_shops WHERE shop_id=$1)", t.ShopID).Scan(&seeded); err != nil {
		return err
	}
	if seeded {
		return nil
	}

	now := time.Now().UTC()
	loc := time.FixedZone("Ulaanbaatar", 8*60*60)
	nowLocal := now.In(loc)
	day := 24 * time.Hour
	products := demoProducts(nowLocal)
	byName := make(map[string]*Product, len(products))
	stock := make([]*Product, 0, 5)
	preorders := make([]*Product, 0, 3)
	for i := range products {
		p := &products[i]
		byName[p.Name] = p
		if p.Preorder == nil {
			stock = append(stock, p)
		} else {
			preorders = append(preorders, p)
		}
		if err := t.Put(ctx, "products", p.ID, *p); err != nil {
			return err
		}
	}
	settings := ShopSettings{BankAccount: &BankAccount{Bank: "Хаан банк", AccountNumber: "1234567890", AccountHolder: "Б. Болор"}}
	if err := t.Put(ctx, "settings", "shop", settings); err != nil {
		return err
	}

	rng := rand.New(rand.NewSource(20260919))
	sequence := 1000
	newCode := func() string {
		for {
			code := fmt.Sprintf("%04d", sequence)
			sequence++
			switch code {
			case "4827", "5163", "7702", "3398", "3315", "6120", "2290", "8841", "1457", "9034":
				continue
			}
			return code
		}
	}
	pick := func(n int) int { return rng.Intn(n) }
	channel := func() Channel {
		r := rng.Float64()
		switch {
		case r < .42:
			return "live"
		case r < .74:
			return "messenger"
		case r < .93:
			return "instagram"
		default:
			return "facebook"
		}
	}
	orders := make([]Order, 0, 1800)
	unmatched := make([]BankPayment, 0, 20)
	today := time.Date(nowLocal.Year(), nowLocal.Month(), nowLocal.Day(), 0, 0, 0, 0, loc)

	for daysBack := 59; daysBack >= 0; daysBack-- {
		isToday := daysBack == 0
		start := today.AddDate(0, 0, -daysBack)
		windowStart := start.Add(8 * time.Hour)
		windowEnd := start.Add(23 * time.Hour)
		if isToday {
			windowStart = now.Add(-12 * time.Hour)
			if windowStart.Before(start) {
				windowStart = start
			}
			windowEnd = now
		}
		count := 14 + pick(25)
		if isToday {
			count = 52
		}
		for i := 0; i < count; i++ {
			created := randomTime(rng, windowStart, windowEnd)
			itemCount := 1
			if rng.Float64() >= .75 {
				itemCount = 2
			}
			items := make([]OrderItem, 0, itemCount)
			for j := 0; j < itemCount; j++ {
				p := stock[pick(len(stock))]
				var variant *string
				if len(p.Variants) > 0 {
					variant = Ptr(p.Variants[pick(len(p.Variants))].Name)
				}
				quantity := int64(1)
				if rng.Float64() >= .8 {
					quantity = 2
				}
				items = append(items, OrderItem{ProductID: p.ID, ProductName: p.Name, VariantName: variant, Quantity: quantity, UnitPrice: Money(p.Price)})
			}
			status := "paid"
			age := now.Sub(created)
			r := rng.Float64()
			if age < 3*time.Hour && r < .2 || isToday && age >= 3*time.Hour && r < .04 || !isToday && r < .04 {
				status = "awaiting_payment"
			}
			var paidAt *Timestamp
			var matched *string
			if status == "paid" {
				paid := created.Add(time.Duration(2+rng.Float64()*38) * time.Minute)
				if paid.After(now) {
					status = "awaiting_payment"
				} else {
					paidAt = Ptr(Stamp(paid))
					matched = Ptr("auto")
					if rng.Float64() < .06 {
						matched = Ptr("manual")
					}
				}
			}
			o := makeDemoOrder(newCode(), demoCustomers[pick(len(demoCustomers))], channel(), items, created, status, paidAt, matched)
			orders = append(orders, o)
		}
		if isToday || rng.Float64() < .3 {
			at := randomTime(rng, windowStart, windowEnd)
			unmatched = append(unmatched, demoPayment(ID(), Money(10_000+pick(90)*1000), "ШИЛЖҮҮЛЭГЧ", "", at))
		}
	}

	preorderCounts := map[PreorderStatus]int{"open": 34, "closed": 41, "arrived": 18}
	for _, p := range preorders {
		for i := 0; i < preorderCounts[p.Preorder.Status]; i++ {
			start := timestampTime(p.CreatedAt)
			end := now
			if p.Preorder.ClosesOn != nil {
				if closes, err := time.ParseInLocation("2006-01-02", *p.Preorder.ClosesOn, loc); err == nil {
					end = closes.AddDate(0, 0, 1)
					if end.After(now) {
						end = now
					}
				}
			}
			created := randomTime(rng, start, end)
			var variant *string
			if len(p.Variants) > 0 {
				x := rng.Float64()
				if x >= .4 {
					x = (rng.Float64() + rng.Float64()) / 2
				}
				variant = Ptr(p.Variants[int(x*float64(len(p.Variants)))].Name)
			}
			quantity := int64(1)
			if rng.Float64() < .1 {
				quantity = 2
			}
			recent := now.Sub(created) < day
			paidChance := .85
			if p.Preorder.Status == "open" && recent {
				paidChance = .65
			}
			paid := p.Preorder.Status != "open" || rng.Float64() < paidChance
			status := "awaiting_payment"
			var paidAt *Timestamp
			var matched *string
			if paid {
				status = "paid"
				paid := created.Add(20 * time.Minute)
				if paid.After(now) {
					paid = now
				}
				paidAt = Ptr(Stamp(paid))
				matched = Ptr("auto")
				p.Preorder.Paid += quantity
			}
			p.Preorder.Ordered += quantity
			item := OrderItem{ProductID: p.ID, ProductName: p.Name, VariantName: variant, Quantity: quantity, UnitPrice: Money(p.Price)}
			orders = append(orders, makeDemoOrder(newCode(), demoCustomers[pick(len(demoCustomers))], channel(), []OrderItem{item}, created, status, paidAt, matched))
		}
	}

	// Add the recognizable review examples used in the admin demo.
	addSpecial := func(code, customer, productName string, variant *string, quantity int64, createdAgo time.Duration, status string, paidAgo time.Duration) Order {
		p := byName[productName]
		items := []OrderItem{{ProductID: p.ID, ProductName: p.Name, VariantName: variant, Quantity: quantity, UnitPrice: Money(p.Price)}}
		created := now.Add(-createdAgo)
		var paidAt *Timestamp
		var matched *string
		if status == "paid" {
			paidAt = Ptr(Stamp(now.Add(-paidAgo)))
			matched = Ptr("auto")
		}
		o := makeDemoOrder(code, customer, "messenger", items, created, status, paidAt, matched)
		orders = append(orders, o)
		return o
	}
	bold := addSpecial("4827", "Болд", "Хар цамц", Ptr("L"), 2, 32*time.Minute, "needs_review", 0)
	addSpecial("5163", "Оюука", "Нүүрний тос", nil, 2, 130*time.Minute, "awaiting_payment", 0)
	addSpecial("7702", "Тэмүүлэн", "Нүүрний тос", nil, 2, 26*time.Hour, "awaiting_payment", 0)
	addSpecial("3398", "Мөнхөө", "Хар цамц", Ptr("M"), 1, 25*time.Minute, "awaiting_payment", 0)
	saraa := addSpecial("3315", "Сараа", "Хар цамц", Ptr("M"), 1, 70*time.Minute, "needs_review", 0)
	ganbat := addSpecial("6120", "Ганбат", "Цагаан пүүз", Ptr("39"), 1, 55*time.Minute, "needs_review", 0)
	nomin := addSpecial("2290", "Номин", "Цагаан малгай", nil, 1, 300*time.Minute, "paid", 290*time.Minute)
	khulan := addSpecial("8841", "Хулан", "Ноосон ороолт", Ptr("Саарал"), 1, 180*time.Minute, "awaiting_payment", 0)
	anujin := addSpecial("1457", "Анужин", "Хар цамц", Ptr("S"), 1, 360*time.Minute, "paid", 350*time.Minute)
	zolzaya := addSpecial("9034", "Золзаяа", "Ноосон ороолт", Ptr("Бор"), 1, 420*time.Minute, "paid", 410*time.Minute)

	for i := range orders {
		o := &orders[i]
		if o.Status == "paid" {
			if rng.Float64() < .85 {
				o.CustomerPhone = Ptr(fmt.Sprintf("8800%04d", pick(10000)))
			}
			if rng.Float64() < .8 {
				o.DeliveryAddress = Ptr(fmt.Sprintf("%s, %d-р хороо, %d-р байр, %d тоот", demoDistricts[pick(len(demoDistricts))], 1+pick(30), 1+pick(90), 1+pick(120)))
			}
			paidTime := timestampTime(*o.PaidAt)
			paidAge := now.Sub(paidTime)
			if paidAge > 2*day || paidAge > day/2 && rng.Float64() < .3 {
				fulfilled := paidTime.Add(time.Duration(float64(minDuration(paidAge, day)) * rng.Float64()))
				o.FulfilledAt = Ptr(Stamp(fulfilled))
			}
		}
	}
	older := make([]int, 0)
	for i := range orders {
		if orders[i].Status == "paid" && now.Sub(timestampTime(orders[i].CreatedAt)) > 3*day {
			older = append(older, i)
		}
	}
	for i := 0; i < 4 && len(older) > 0; i++ {
		n := pick(len(older))
		o := &orders[older[n]]
		older = append(older[:n], older[n+1:]...)
		o.Status = "cancelled"
		o.FulfilledAt = nil
		o.CancelledAt = Ptr(Stamp(timestampTime(o.CreatedAt).Add(day)))
		o.CancelReason = Ptr([]string{"Хэмжээ дууссан", "Худалдан авагч цуцалсан"}[i%2])
	}
	for _, p := range preorders {
		p.Preorder.Ordered, p.Preorder.Paid = 0, 0
		for _, o := range orders {
			if o.Status == "cancelled" {
				continue
			}
			for _, item := range o.Items {
				if item.ProductID == p.ID {
					p.Preorder.Ordered += item.Quantity
					if o.Status == "paid" {
						p.Preorder.Paid += item.Quantity
					}
				}
			}
		}
	}

	for _, o := range orders {
		if err := putDemoOrder(ctx, t, o); err != nil {
			return err
		}
	}
	// Preorder counters are materialized on Product but derived here from fixtures.
	for _, p := range preorders {
		if err := t.Put(ctx, "products", p.ID, *p); err != nil {
			return err
		}
	}
	for _, p := range unmatched {
		if err := putDemoPayment(ctx, t, p, nil); err != nil {
			return err
		}
	}
	for _, fixture := range demoReviewCases(now, bold, saraa, ganbat, nomin, khulan, anujin, zolzaya) {
		if err := putDemoPayment(ctx, t, fixture.payment, fixture.orderID); err != nil {
			return err
		}
		if err := t.Put(ctx, "review_cases", fixture.review.ID, fixture.review); err != nil {
			return err
		}
		if _, err := t.Exec(ctx, "UPDATE review_cases SET undo=$3 WHERE shop_id=$1 AND id=$2", t.ShopID, fixture.review.ID, []byte("[]")); err != nil {
			return err
		}
	}
	_, err := t.Exec(ctx, "INSERT INTO demo_seeded_shops(shop_id) VALUES($1) ON CONFLICT(shop_id) DO NOTHING", t.ShopID)
	return err
}

func demoProducts(now time.Time) []Product {
	product := func(code, source, name string, price int64, variants []ProductVariant, stock int64) Product {
		return Product{ID: ID(), Code: code, CodeSource: source, SaleType: "stock", Name: name, Price: Money(price), Variants: variants, Stock: stock, CreatedAt: Stamp(now.AddDate(0, 0, -60))}
	}
	variant := func(name string, quantity int64) ProductVariant {
		return ProductVariant{ID: ID(), Name: name, Quantity: quantity}
	}
	preorder := func(code, name string, price int64, variantNames []string, createdDaysAgo int, status PreorderStatus, closeDays int, note *string, limit *int64) Product {
		variants := make([]ProductVariant, 0, len(variantNames))
		for _, name := range variantNames {
			variants = append(variants, variant(name, 0))
		}
		close := now.AddDate(0, 0, closeDays).Format("2006-01-02")
		return Product{ID: ID(), Code: code, CodeSource: "auto", SaleType: "preorder", Name: name, Price: Money(price), Variants: variants, Preorder: &PreorderInfo{ClosesOn: &close, ArrivalNote: note, Limit: limit, Status: status}, CreatedAt: Stamp(now.AddDate(0, 0, -createdDaysAgo))}
	}
	openNote := "Захиалга хаагдсанаас хойш 2–3 долоо хоногт ирнэ"
	closedNote := "Ойролцоогоор 10 хоногийн дараа ирнэ"
	limit := int64(60)
	return []Product{
		product("KTS", "custom", "Хар цамц", 35000, []ProductVariant{variant("S", 4), variant("M", 6), variant("L", 2)}, 0),
		product("MLG", "auto", "Цагаан малгай", 17000, []ProductVariant{}, 10),
		product("PUZ", "auto", "Цагаан пүүз", 89000, []ProductVariant{variant("38", 3), variant("39", 4), variant("40", 3)}, 0),
		product("TOS", "auto", "Нүүрний тос", 25000, []ProductVariant{}, 0),
		product("ORL", "custom", "Ноосон ороолт", 45000, []ProductVariant{variant("Саарал", 5), variant("Бор", 3)}, 0),
		preorder("PUH", "Солонгос пуховик", 189000, []string{"S", "M", "L", "XL"}, 9, "open", 5, &openNote, &limit),
		preorder("NAF", "Nike Air Force 1", 245000, []string{"37", "38", "39", "40", "41", "42"}, 20, "closed", -2, &closedNote, nil),
		preorder("SUN", "Япон нарны тос", 39000, []string{}, 30, "arrived", -18, nil, nil),
	}
}

func randomTime(rng *rand.Rand, start, end time.Time) time.Time {
	if !end.After(start) {
		return start
	}
	return start.Add(time.Duration(rng.Int63n(int64(end.Sub(start)))))
}

func timestampTime(value Timestamp) time.Time {
	t, err := time.Parse(time.RFC3339Nano, string(value))
	if err != nil {
		return time.Time{}
	}
	return t
}

func makeDemoOrder(code, customer string, channel Channel, items []OrderItem, created time.Time, status string, paidAt *Timestamp, matched *string) Order {
	total := Money(0)
	for _, item := range items {
		total += item.UnitPrice * Money(item.Quantity)
	}
	var chatURL *string
	switch channel {
	case "instagram":
		chatURL = Ptr("https://www.instagram.com/direct/inbox/")
	case "messenger", "facebook":
		chatURL = Ptr("https://business.facebook.com/latest/inbox/all")
	}
	return Order{ID: ID(), Code: code, CustomerName: customer, Channel: channel, Items: items, Total: total, Status: status, CreatedAt: Stamp(created), PaidAt: paidAt, MatchedBy: matched, FulfilledAt: nil, CancelledAt: nil, CancelReason: nil, ChatURL: chatURL}
}

func putDemoOrder(ctx context.Context, t *store.Tx, o Order) error {
	raw, err := json.Marshal(o)
	if err != nil {
		return err
	}
	conversation := ""
	if o.Channel != "live" {
		conversation = "demo-" + string(o.Channel) + "-" + o.Code
	}
	_, err = t.Exec(ctx, "INSERT INTO orders(shop_id,id,body,conversation_id) VALUES($1,$2,$3,$4)", t.ShopID, o.ID, raw, conversation)
	return err
}

func demoPayment(id string, amount Money, sender, note string, at time.Time) BankPayment {
	return BankPayment{ID: id, Amount: amount, SenderName: sender, Note: note, Bank: "Хаан банк", ReceivedAt: Stamp(at), RawMessage: fmt.Sprintf("KHANBANK: %s dansand %d.00MNT orlogo orloo. Ilgeegch: %s. Utga: %s", at.In(time.FixedZone("Ulaanbaatar", 8*60*60)).Format("15:04"), amount, sender, note)}
}

func putDemoPayment(ctx context.Context, t *store.Tx, p BankPayment, orderID *string) error {
	raw, err := json.Marshal(p)
	if err != nil {
		return err
	}
	_, err = t.Exec(ctx, "INSERT INTO payments(shop_id,id,external_id,body,order_id) VALUES($1,$2,$3,$4,$5)", t.ShopID, p.ID, "demo-"+p.ID, raw, orderID)
	return err
}

type demoCaseFixture struct {
	payment BankPayment
	orderID *string
	review  ReviewCase
}

func demoReviewCases(now time.Time, bold, saraa, ganbat, nomin, khulan, anujin, zolzaya Order) []demoCaseFixture {
	matchedCase := func(order Order, difference int64, action *DifferenceAction, resolved time.Time) *CaseResolution {
		return &CaseResolution{Kind: "matched", OrderID: order.ID, OrderCode: order.Code, CustomerName: order.CustomerName, Difference: difference, DifferenceAction: action, ResolvedAt: Stamp(resolved)}
	}
	create := func(amount Money, sender, note string, minutes int, reason, status string, suggestion *Order, contact *CaseContact, refund *CaseRefund, resolution *CaseResolution, linked *string, message *string) demoCaseFixture {
		payment := demoPayment(ID(), amount, sender, note, now.Add(-time.Duration(minutes)*time.Minute))
		var candidate *MatchCandidate
		if suggestion != nil {
			v := candidateFor(*suggestion, payment)
			candidate = &v
		}
		review := ReviewCase{ID: ID(), Payment: payment, Reason: reason, Status: status, Suggestion: candidate, Candidates: []MatchCandidate{}, Contact: contact, Refund: refund, Resolution: resolution, Note: message}
		return demoCaseFixture{payment: payment, orderID: linked, review: review}
	}
	open := []demoCaseFixture{
		create(87000, "БОЛДБААТАР Г.", "4872 tsamts", 20, "code_typo", "open", &bold, nil, nil, nil, nil, nil),
		create(50000, "ОЮУНЧИМЭГ Д.", "tulbur", 15, "no_code", "open", nil, nil, nil, nil, nil, nil),
		create(50000, "САРАНТУЯА Б.", "3315", 60, "amount_mismatch", "open", &saraa, nil, nil, nil, nil, nil),
		create(80000, "ГАНБАТ Т.", "6120 puuz", 45, "amount_mismatch", "open", &ganbat, nil, nil, nil, nil, nil),
		create(17000, "НОМИН Э.", "2290", 40, "duplicate", "open", &nomin, nil, nil, nil, nil, nil),
	}
	contact := &CaseContact{OrderID: khulan.ID, CustomerName: khulan.CustomerName, Message: "Сайн байна уу! 45,000₮ шилжүүлсэн нь та мөн үү? Захиалгын кодоо бичнэ үү.", SentAt: Stamp(now.Add(-150 * time.Minute))}
	open = append(open, create(45000, "ХУЛАН Б.", "", 160, "no_code", "waiting_buyer", nil, contact, nil, nil, nil, nil))
	refundAction := DifferenceAction("refund")
	refund := &CaseRefund{Amount: 10000, Status: "pending"}
	open = append(open, create(45000, "АНУЖИН С.", "1457", 350, "amount_mismatch", "resolved", &anujin, nil, refund, matchedCase(anujin, 10000, &refundAction, now.Add(-340*time.Minute)), &anujin.ID, nil))
	open = append(open, create(45000, "ЗОЛЗАЯА Н.", "9043", 410, "code_typo", "resolved", &zolzaya, nil, nil, matchedCase(zolzaya, 0, nil, now.Add(-400*time.Minute)), &zolzaya.ID, nil))
	noOrder := &CaseResolution{Kind: "no_order", Category: "other_income", ResolvedAt: Stamp(now.Add(-25 * time.Hour))}
	open = append(open, create(120000, "ЭНХБАЯР Д.", "zeel", 26*60, "no_code", "resolved", nil, nil, nil, noOrder, nil, Ptr("Ахын буцаасан зээл")))
	return open
}

func minDuration(a, b time.Duration) time.Duration {
	if a < b {
		return a
	}
	return b
}

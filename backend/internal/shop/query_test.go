package shop

import (
	"net/url"
	"strings"
	"testing"
	"time"
)

func TestTimeRanges(t *testing.T) {
	valid := url.Values{"from": {"2026-09-13T00:00:00+08:00"}, "to": {"2026-09-20T00:00:00+08:00"}}
	q, e := ParseQuery(valid, true)
	if e != nil {
		t.Fatal(e)
	}
	if q.From != "2026-09-12T16:00:00.000000000Z" || q.Limit != 50 {
		t.Fatalf("unexpected normalized query: %+v", q)
	}
	for _, v := range []url.Values{{}, {"from": {"2026-09-13"}, "to": {"2026-09-20"}}, {"from": valid["from"], "to": valid["from"]}, {"from": valid["to"], "to": valid["from"]}, {"from": valid["from"], "to": valid["to"], "limit": {"201"}}, {"from": valid["from"], "to": valid["to"], "cursor": {""}}, {"from": valid["from"], "to": valid["to"], "limit": {"1", "2"}}} {
		if _, e = ParseQuery(v, true); e == nil {
			t.Fatalf("accepted invalid query: %v", v)
		}
	}
}
func TestCursorScopeAndTamper(t *testing.T) {
	s := &Service{CursorKey: []byte(strings.Repeat("x", 32))}
	q := Query{Limit: 1}
	sc := scope("shop-a", "products", q)
	token := s.encodeCursor(cursor{sc, "ABC", "id"})
	if _, e := s.decodeCursor(token, sc); e != nil {
		t.Fatal(e)
	}
	for _, scopeValue := range []string{scope("shop-b", "products", q), scope("shop-a", "orders", q), scope("shop-a", "products", Query{Limit: 2})} {
		if _, e := s.decodeCursor(token, scopeValue); e == nil {
			t.Fatal("accepted foreign cursor")
		}
	}
	if _, e := s.decodeCursor("x"+token, sc); e == nil {
		t.Fatal("accepted tampered cursor")
	}
}
func TestTimestampOrder(t *testing.T) {
	a := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	if Stamp(a) >= Stamp(a.Add(time.Nanosecond)) {
		t.Fatal("timestamp text order is not chronological")
	}
}

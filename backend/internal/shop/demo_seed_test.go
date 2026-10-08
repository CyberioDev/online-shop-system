package shop

import (
	"context"
	"os"
	"testing"

	"online-shop/backend/internal/store"
)

func TestDemoSeedIsCompleteAndIdempotent(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set TEST_DATABASE_URL or run docker compose -f compose.test.yaml up")
	}
	ctx := context.Background()
	db, err := store.Open(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Pool.Close()
	if err := db.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	shopID := "demo-test-" + ID()
	if _, err := db.Pool.Exec(ctx, "INSERT INTO shops(id,name) VALUES($1,'Demo test')", shopID); err != nil {
		t.Fatal(err)
	}
	seed := func() error {
		return db.Within(ctx, shopID, true, func(tx *store.Tx) error { return seedDemoShop(ctx, tx) })
	}
	if err := seed(); err != nil {
		t.Fatal(err)
	}
	var products, orders, cases int
	if err := db.Pool.QueryRow(ctx, "SELECT count(*) FROM products WHERE shop_id=$1", shopID).Scan(&products); err != nil {
		t.Fatal(err)
	}
	if err := db.Pool.QueryRow(ctx, "SELECT count(*) FROM orders WHERE shop_id=$1", shopID).Scan(&orders); err != nil {
		t.Fatal(err)
	}
	if err := db.Pool.QueryRow(ctx, "SELECT count(*) FROM review_cases WHERE shop_id=$1", shopID).Scan(&cases); err != nil {
		t.Fatal(err)
	}
	if products != 8 || orders < 1000 || cases != 9 {
		t.Fatalf("unexpected demo fixture counts: products=%d orders=%d review_cases=%d", products, orders, cases)
	}
	if err := seed(); err != nil {
		t.Fatal(err)
	}
	var ordersAfter int
	if err := db.Pool.QueryRow(ctx, "SELECT count(*) FROM orders WHERE shop_id=$1", shopID).Scan(&ordersAfter); err != nil {
		t.Fatal(err)
	}
	if ordersAfter != orders {
		t.Fatalf("repeated seed changed order count: before=%d after=%d", orders, ordersAfter)
	}
}

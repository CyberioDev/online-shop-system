package shop

import (
	"context"
	"log/slog"
	"online-shop/backend/internal/store"
	"time"
)

// CloseExpiredPreorders shares the same tenant write lock as order creation.
func (s *Service) CloseExpiredPreorders(ctx context.Context) error {
	rows, e := s.DB.Pool.Query(ctx, `SELECT DISTINCT shop_id FROM products WHERE body->'preorder'->>'status'='open' AND body->'preorder'->>'closesOn'<to_char(now() AT TIME ZONE 'Asia/Ulaanbaatar','YYYY-MM-DD')`)
	if e != nil {
		return e
	}
	ids := []string{}
	for rows.Next() {
		var id string
		if e = rows.Scan(&id); e != nil {
			rows.Close()
			return e
		}
		ids = append(ids, id)
	}
	e = rows.Err()
	rows.Close()
	if e != nil {
		return e
	}
	for _, id := range ids {
		if e = s.Write(ctx, id, func(t *store.Tx) error {
			_, err := t.Exec(ctx, `UPDATE products SET body=jsonb_set(body,'{preorder,status}','"closed"') WHERE shop_id=$1 AND body->'preorder'->>'status'='open' AND body->'preorder'->>'closesOn'<to_char(now() AT TIME ZONE 'Asia/Ulaanbaatar','YYYY-MM-DD')`, id)
			return err
		}); e != nil {
			return e
		}
	}
	return nil
}
func (s *Service) Maintain(ctx context.Context) {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for {
		if e := s.CloseExpiredPreorders(ctx); e != nil && ctx.Err() == nil {
			slog.Error("preorder maintenance failed", "error", e)
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

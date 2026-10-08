// Package store contains PostgreSQL persistence. Domain documents remain typed in
// shop; PostgreSQL owns tenant scoping, uniqueness, filtering and transactions.
package store

import (
	"context"
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed migrations/*.sql
var migrations embed.FS

type Store struct{ Pool *pgxpool.Pool }
type Tx struct {
	pgx.Tx
	ShopID string
}

func Open(ctx context.Context, url string) (*Store, error) {
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, err
	}
	if err = pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return &Store{pool}, nil
}
func (s *Store) Migrate(ctx context.Context) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(721854392)"); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, "CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())"); err != nil {
		return err
	}
	files, err := migrations.ReadDir("migrations")
	if err != nil {
		return err
	}
	for _, file := range files {
		raw, err := migrations.ReadFile("migrations/" + file.Name())
		if err != nil {
			return err
		}
		sum := sha256.Sum256(raw)
		checksum := hex.EncodeToString(sum[:])
		var stored string
		err = tx.QueryRow(ctx, "SELECT checksum FROM schema_migrations WHERE name=$1", file.Name()).Scan(&stored)
		if err == nil {
			if stored != checksum {
				return fmt.Errorf("migration %s changed after application", file.Name())
			}
			continue
		}
		if err != pgx.ErrNoRows {
			return err
		}
		if _, err = tx.Exec(ctx, string(raw)); err != nil {
			return fmt.Errorf("migration %s: %w", file.Name(), err)
		}
		if _, err = tx.Exec(ctx, "INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)", file.Name(), checksum); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

// Serialize mutations within a shop. Different shops proceed independently.
// Readers use a consistent snapshot so page counts and results agree.
func (s *Store) Within(ctx context.Context, shopID string, write bool, fn func(*Tx) error) error {
	opts := pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly}
	if write {
		opts = pgx.TxOptions{IsoLevel: pgx.ReadCommitted}
	}
	tx, err := s.Pool.BeginTx(ctx, opts)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if write {
		if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended($1,0))", shopID); err != nil {
			return err
		}
	}
	if err = fn(&Tx{tx, shopID}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
func table(name string) string {
	switch name {
	case "products", "orders", "payments", "review_cases", "settings", "integrations":
		return name
	default:
		panic("invalid repository table")
	}
}
func (t *Tx) Get(ctx context.Context, name, id string, out any) error {
	var raw []byte
	err := t.QueryRow(ctx, "SELECT body FROM "+table(name)+" WHERE shop_id=$1 AND id=$2", t.ShopID, id).Scan(&raw)
	if err != nil {
		return err
	}
	return json.Unmarshal(raw, out)
}
func (t *Tx) Put(ctx context.Context, name, id string, v any) error {
	raw, err := json.Marshal(v)
	if err != nil {
		return err
	}
	_, err = t.Exec(ctx, "INSERT INTO "+table(name)+"(shop_id,id,body) VALUES($1,$2,$3) ON CONFLICT(shop_id,id) DO UPDATE SET body=excluded.body", t.ShopID, id, raw)
	return err
}
func (t *Tx) Delete(ctx context.Context, name, id string) error {
	r, err := t.Exec(ctx, "DELETE FROM "+table(name)+" WHERE shop_id=$1 AND id=$2", t.ShopID, id)
	if err == nil && r.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return err
}

// Select accepts only internal SQL fragments; all client input stays in args.
func Select[T any](ctx context.Context, t *Tx, name, where, order string, args ...any) ([]T, error) {
	q := "SELECT body FROM " + table(name) + " WHERE shop_id=$1 " + where
	if order != "" {
		q += " ORDER BY " + order
	}
	rows, err := t.Query(ctx, q, append([]any{t.ShopID}, args...)...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []T{}
	for rows.Next() {
		var raw []byte
		var v T
		if err = rows.Scan(&raw); err != nil {
			return nil, err
		}
		if err = json.Unmarshal(raw, &v); err != nil {
			return nil, err
		}
		result = append(result, v)
	}
	return result, rows.Err()
}
func (t *Tx) Enqueue(ctx context.Context, id, kind string, v any) error {
	raw, err := json.Marshal(v)
	if err != nil {
		return err
	}
	_, err = t.Exec(ctx, "INSERT INTO outbox(id,shop_id,kind,body) VALUES($1,$2,$3,$4)", id, t.ShopID, kind, raw)
	return err
}

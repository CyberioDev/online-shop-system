// Package delivery sends committed outbox events to each shop's automation flow.
package delivery

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"online-shop/backend/internal/store"
)

func ValidateURL(raw string) error {
	u, e := url.Parse(raw)
	if e != nil || u.Scheme != "https" || u.Hostname() == "" || u.User != nil || u.Fragment != "" {
		return errors.New("webhook URL must use HTTPS without credentials or fragment")
	}
	return nil
}

// Resolve and dial the checked IP directly to prevent DNS rebinding. Integration
// URLs cannot access localhost, private networks or cloud metadata endpoints.
func Client() *http.Client {
	return &http.Client{Timeout: 10 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }, Transport: &http.Transport{Proxy: nil, DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
		host, port, e := net.SplitHostPort(address)
		if e != nil {
			return nil, e
		}
		ips, e := net.DefaultResolver.LookupIPAddr(ctx, host)
		if e != nil {
			return nil, e
		}
		if len(ips) == 0 {
			return nil, errors.New("no IP addresses")
		}
		for _, v := range ips {
			if !publicIP(v.IP) {
				return nil, errors.New("private webhook destination is not allowed")
			}
		}
		return (&net.Dialer{Timeout: 5 * time.Second}).DialContext(ctx, network, net.JoinHostPort(ips[0].IP.String(), port))
	}}}
}
func publicIP(ip net.IP) bool {
	if !ip.IsGlobalUnicast() || ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsUnspecified() {
		return false
	}
	for _, cidr := range []string{"100.64.0.0/10", "192.0.0.0/24", "198.18.0.0/15", "2001:db8::/32", "64:ff9b::/96"} {
		_, n, _ := net.ParseCIDR(cidr)
		if n.Contains(ip) {
			return false
		}
	}
	return true
}

type Worker struct {
	DB   *store.Store
	HTTP *http.Client
}

func (w *Worker) Run(ctx context.Context) {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			for i := 0; i < 20; i++ {
				found, e := w.Once(ctx)
				if e != nil {
					slog.Error("webhook delivery failed", "error", e)
					break
				}
				if !found {
					break
				}
			}
		}
	}
}
func (w *Worker) Once(ctx context.Context) (bool, error) {
	tx, e := w.DB.Pool.Begin(ctx)
	if e != nil {
		return false, e
	}
	defer tx.Rollback(ctx)
	var id, shopID, kind, target, secret string
	var raw []byte
	var attempts int
	var created time.Time
	e = tx.QueryRow(ctx, `SELECT o.id,o.shop_id,o.kind,o.body,o.attempts,o.created_at,t.url,t.secret FROM outbox o JOIN webhook_targets t ON t.shop_id=o.shop_id AND t.kind=CASE WHEN o.kind LIKE 'sms.%' THEN 'sms' ELSE 'chatbot' END WHERE o.delivered_at IS NULL AND o.next_attempt_at<=now() ORDER BY o.created_at,o.id LIMIT 1 FOR UPDATE OF o SKIP LOCKED`).Scan(&id, &shopID, &kind, &raw, &attempts, &created, &target, &secret)
	if errors.Is(e, pgx.ErrNoRows) {
		return false, nil
	}
	if e != nil {
		return false, e
	}
	// Expired SMS reset codes must not be delivered after an outage.
	if kind == "sms.password_reset" && time.Since(created) >= 10*time.Minute {
		if _, e = tx.Exec(ctx, "UPDATE outbox SET delivered_at=now(),body='{}'::jsonb WHERE id=$1", id); e != nil {
			return false, e
		}
		return true, tx.Commit(ctx)
	}
	// Owner-only notes and review internals do not belong in chatbot webhooks.
	var data any
	if e = json.Unmarshal(raw, &data); e != nil {
		return false, e
	}
	sanitize(data)
	event := map[string]any{"id": id, "shopId": shopID, "type": kind, "createdAt": created.UTC().Format(time.RFC3339Nano), "data": data}
	payload, e := json.Marshal(event)
	if e != nil {
		return false, e
	}
	timestamp := fmt.Sprint(time.Now().Unix())
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(timestamp + "."))
	mac.Write(payload)
	request, e := http.NewRequestWithContext(ctx, http.MethodPost, target, strings.NewReader(string(payload)))
	if e != nil {
		return false, e
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Webhook-ID", id)
	request.Header.Set("X-Webhook-Timestamp", timestamp)
	request.Header.Set("X-Webhook-Signature", "sha256="+hex.EncodeToString(mac.Sum(nil)))
	// Simple constant credential verification is convenient in Make/Zapier. The
	// HMAC additionally authenticates the exact body and timestamp when supported.
	request.Header.Set("Authorization", "Bearer "+secret)
	success := false
	if ValidateURL(target) == nil {
		response, err := w.HTTP.Do(request)
		if err == nil {
			_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4096))
			response.Body.Close()
			success = response.StatusCode >= 200 && response.StatusCode < 300
		}
	}
	if success {
		_, e = tx.Exec(ctx, "UPDATE outbox SET delivered_at=now(),attempts=attempts+1,body=CASE WHEN kind LIKE 'sms.%' THEN '{}'::jsonb ELSE body END WHERE id=$1", id)
	} else {
		delay := time.Second * time.Duration(1<<min(attempts+1, 12))
		_, e = tx.Exec(ctx, "UPDATE outbox SET attempts=attempts+1,next_attempt_at=$2 WHERE id=$1", id, time.Now().Add(delay))
		slog.Warn("webhook retry scheduled", "event_id", id, "shop_id", shopID, "attempt", attempts+1)
	}
	if e != nil {
		return false, e
	}
	return true, tx.Commit(ctx)
}
func sanitize(v any) {
	switch x := v.(type) {
	case map[string]any:
		delete(x, "sellerNote")
		delete(x, "rawMessage")
		delete(x, "candidates")
		delete(x, "suggestion")
		if _, isCase := x["payment"]; isCase {
			delete(x, "note")
		}
		for _, v := range x {
			sanitize(v)
		}
	case []any:
		for _, v := range x {
			sanitize(v)
		}
	}
}

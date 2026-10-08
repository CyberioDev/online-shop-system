package shop

import (
	"context"
	"crypto/subtle"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
	"online-shop/backend/internal/store"
)

type Identity struct{ ShopID, UserID, Role, TokenHash string }
type Bootstrap struct {
	ShopID, ShopName, OwnerName, Phone, Password, ChatbotKey, BankKey, WebhookURL, WebhookSecret, SMSURL, SMSSecret string
	DemoData                                                                                                        bool
}

func (s *Service) Bootstrap(ctx context.Context, b Bootstrap) error {
	if b.Phone == "" {
		return nil
	}
	if !phoneRE.MatchString(b.Phone) || len(b.Password) < 8 || len(b.Password) > 72 || b.ShopID == "" || b.ShopName == "" || len(b.ChatbotKey) < 32 || len(b.BankKey) < 32 || b.ChatbotKey == b.BankKey {
		return fmt.Errorf("invalid bootstrap configuration; use distinct integration keys of at least 32 characters")
	}
	hash, e := bcrypt.GenerateFromPassword([]byte(b.Password), bcrypt.DefaultCost)
	if e != nil {
		return e
	}
	return s.Write(ctx, b.ShopID, func(t *store.Tx) error {
		if _, e = t.Exec(ctx, "INSERT INTO shops(id,name) VALUES($1,$2) ON CONFLICT(id) DO NOTHING", b.ShopID, b.ShopName); e != nil {
			return e
		}
		var existingShop string
		e = t.QueryRow(ctx, "SELECT shop_id FROM users WHERE phone=$1", b.Phone).Scan(&existingShop)
		if e == nil && existingShop != b.ShopID {
			return fmt.Errorf("bootstrap owner belongs to a different shop")
		}
		if e != nil && !errors.Is(e, pgx.ErrNoRows) {
			return e
		}
		if _, e = t.Exec(ctx, "INSERT INTO users(id,shop_id,phone,name,password_hash) VALUES($1,$2,$3,$4,$5) ON CONFLICT(phone) DO NOTHING", ID(), b.ShopID, b.Phone, b.OwnerName, string(hash)); e != nil {
			return e
		}
		for _, key := range []struct{ role, token string }{{"chatbot", b.ChatbotKey}, {"bank", b.BankKey}} {
			var tenant string
			e = t.QueryRow(ctx, "SELECT shop_id FROM service_keys WHERE token_hash=$1", Hash(key.token)).Scan(&tenant)
			if e == nil && tenant != b.ShopID {
				return fmt.Errorf("integration key already belongs to another shop")
			}
			if e != nil && !errors.Is(e, pgx.ErrNoRows) {
				return e
			}
			var listener *string
			if key.role == "bank" {
				listener = Ptr(b.ShopID)
			}
			if _, e = t.Exec(ctx, "INSERT INTO service_keys(token_hash,shop_id,role,listener_id) VALUES($1,$2,$3,$4) ON CONFLICT(token_hash) DO NOTHING", Hash(key.token), b.ShopID, key.role, listener); e != nil {
				return e
			}
		}
		for _, target := range []struct{ kind, url, secret string }{{"chatbot", b.WebhookURL, b.WebhookSecret}, {"sms", b.SMSURL, b.SMSSecret}} {
			if target.url == "" {
				continue
			}
			if !validURL(target.url) || !strings.HasPrefix(target.url, "https://") || len(target.secret) < 32 {
				return fmt.Errorf("invalid %s webhook target", target.kind)
			}
			if _, e = t.Exec(ctx, "INSERT INTO webhook_targets(shop_id,kind,url,secret) VALUES($1,$2,$3,$4) ON CONFLICT(shop_id,kind) DO NOTHING", b.ShopID, target.kind, target.url, target.secret); e != nil {
				return e
			}
		}
		if b.DemoData && b.ShopID == "demo-shop" {
			if e = seedDemoShop(ctx, t); e != nil {
				return e
			}
		}
		return nil
	})
}
func (s *Service) Authenticate(ctx context.Context, token, role string) (Identity, error) {
	i := Identity{Role: role, TokenHash: Hash(token)}
	if len(token) < 32 {
		return i, Unauthorized()
	}
	var e error
	if role == "owner" {
		e = s.DB.Pool.QueryRow(ctx, "SELECT u.shop_id,u.id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()", i.TokenHash).Scan(&i.ShopID, &i.UserID)
	} else {
		e = s.DB.Pool.QueryRow(ctx, "SELECT shop_id FROM service_keys WHERE token_hash=$1 AND role=$2", i.TokenHash, role).Scan(&i.ShopID)
	}
	if errors.Is(e, pgx.ErrNoRows) {
		return i, Unauthorized()
	}
	return i, e
}
func (s *Service) Login(ctx context.Context, phone, password string) (Session, error) {
	var r Session
	var hash, shopID string
	e := s.DB.Pool.QueryRow(ctx, "SELECT u.id,u.name,u.phone,s.name,u.password_hash,u.shop_id FROM users u JOIN shops s ON s.id=u.shop_id WHERE u.phone=$1", phone).Scan(&r.User.ID, &r.User.Name, &r.User.Phone, &r.User.ShopName, &hash, &shopID)
	if e != nil && !errors.Is(e, pgx.ErrNoRows) {
		return r, e
	}
	if errors.Is(e, pgx.ErrNoRows) {
		hash = "$2a$10$7EqJtq98hPqEX7fNZaFWoO5xPqNKz1HZs/Q/XfJA3lvQI8HjaQU8u"
	}
	check := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	if e != nil || check != nil {
		return r, &Error{401, "invalid_credentials", "Утасны дугаар эсвэл нууц үг буруу байна."}
	}
	r.Token = ID() + ID()
	e = s.Write(ctx, shopID, func(t *store.Tx) error {
		// Re-check after taking the shop lock, so concurrent password resets cannot
		// create a session authenticated with a revoked password.
		var current string
		if e := t.QueryRow(ctx, "SELECT password_hash FROM users WHERE id=$1 AND shop_id=$2", r.User.ID, shopID).Scan(&current); e != nil {
			return e
		}
		if current != hash {
			return Unauthorized()
		}
		_, e := t.Exec(ctx, "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)", Hash(r.Token), r.User.ID, time.Now().Add(30*24*time.Hour))
		return e
	})
	return r, e
}
func (s *Service) Logout(ctx context.Context, i Identity) error {
	_, e := s.DB.Pool.Exec(ctx, "DELETE FROM sessions WHERE token_hash=$1 AND user_id=$2", i.TokenHash, i.UserID)
	return e
}
func (s *Service) ChangePassword(ctx context.Context, t *store.Tx, i Identity, current, next string) error {
	if len(next) < 8 || len(next) > 72 {
		return Invalid()
	}
	var hash string
	if e := t.QueryRow(ctx, "SELECT password_hash FROM users WHERE id=$1 AND shop_id=$2", i.UserID, t.ShopID).Scan(&hash); e != nil {
		return e
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(current)) != nil {
		return Invalid()
	}
	encoded, e := bcrypt.GenerateFromPassword([]byte(next), bcrypt.DefaultCost)
	if e != nil {
		return e
	}
	if _, e = t.Exec(ctx, "UPDATE users SET password_hash=$3 WHERE id=$1 AND shop_id=$2", i.UserID, t.ShopID, string(encoded)); e != nil {
		return e
	}
	_, e = t.Exec(ctx, "DELETE FROM sessions WHERE user_id=$1 AND token_hash<>$2", i.UserID, i.TokenHash)
	return e
}
func (s *Service) RequestReset(ctx context.Context, phone string) error {
	if !phoneRE.MatchString(phone) {
		return Invalid()
	}
	var shopID string
	e := s.DB.Pool.QueryRow(ctx, "SELECT shop_id FROM users WHERE phone=$1", phone).Scan(&shopID)
	if errors.Is(e, pgx.ErrNoRows) {
		return nil
	}
	if e != nil {
		return e
	}
	return s.Write(ctx, shopID, func(t *store.Tx) error {
		var available bool
		if e := t.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM webhook_targets WHERE shop_id=$1 AND kind='sms')", shopID).Scan(&available); e != nil {
			return e
		}
		if !available {
			return nil
		} // Same public response for unknown/unconfigured accounts.
		var recent bool
		if e := t.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM password_resets WHERE phone=$1 AND requested_at>now()-interval '1 minute')", phone).Scan(&recent); e != nil {
			return e
		}
		if recent {
			return nil
		}
		code := fmt.Sprintf("%06d", randomNumber(1_000_000))
		if _, e = t.Exec(ctx, "INSERT INTO password_resets(phone,code_hash,expires_at) VALUES($1,$2,now()+interval '10 minutes') ON CONFLICT(phone) DO UPDATE SET code_hash=excluded.code_hash,expires_at=excluded.expires_at,attempts=0,requested_at=now()", phone, Hash(phone+code+string(s.CursorKey))); e != nil {
			return e
		}
		return t.Enqueue(ctx, ID(), "sms.password_reset", map[string]string{"phone": phone, "code": code})
	})
}
func (s *Service) ConfirmReset(ctx context.Context, phone, code, password string) error {
	if !phoneRE.MatchString(phone) || len(code) != 6 || len(password) < 8 || len(password) > 72 {
		return Invalid()
	}
	var shopID string
	e := s.DB.Pool.QueryRow(ctx, "SELECT shop_id FROM users WHERE phone=$1", phone).Scan(&shopID)
	if errors.Is(e, pgx.ErrNoRows) {
		return Invalid()
	}
	if e != nil {
		return e
	}
	valid := false
	e = s.Write(ctx, shopID, func(t *store.Tx) error {
		var hash string
		err := t.QueryRow(ctx, "SELECT code_hash FROM password_resets WHERE phone=$1 AND expires_at>now() AND attempts<5 FOR UPDATE", phone).Scan(&hash)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		if err != nil {
			return err
		}
		if subtle.ConstantTimeCompare([]byte(hash), []byte(Hash(phone+code+string(s.CursorKey)))) != 1 {
			_, err = t.Exec(ctx, "UPDATE password_resets SET attempts=attempts+1 WHERE phone=$1", phone)
			return err
		}
		encoded, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if err != nil {
			return err
		}
		if _, err = t.Exec(ctx, "UPDATE users SET password_hash=$3 WHERE phone=$1 AND shop_id=$2", phone, shopID, string(encoded)); err != nil {
			return err
		}
		if _, err = t.Exec(ctx, "DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE phone=$1 AND shop_id=$2)", phone, shopID); err != nil {
			return err
		}
		_, err = t.Exec(ctx, "DELETE FROM password_resets WHERE phone=$1", phone)
		valid = err == nil
		return err
	})
	if e != nil {
		return e
	}
	if !valid {
		return Invalid()
	}
	return nil
}
func (s *Service) HasTarget(ctx context.Context, t *store.Tx, kind string) (bool, error) {
	var exists bool
	e := t.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM webhook_targets WHERE shop_id=$1 AND kind=$2)", t.ShopID, kind).Scan(&exists)
	return exists, e
}

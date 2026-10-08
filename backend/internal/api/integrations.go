package api

import (
	"context"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/labstack/echo/v5"
	"online-shop/backend/internal/delivery"
	"online-shop/backend/internal/shop"
	"online-shop/backend/internal/store"
)

func (a *Server) integrations(c *echo.Context) error {
	return a.tx(c, false, func(ctx context.Context, t *store.Tx) (any, error) {
		var listener *string
		err := t.QueryRow(ctx, "SELECT min(listener_id) FROM service_keys WHERE shop_id=$1 AND role='bank' AND listener_id LIKE 'sms-%'", t.ShopID).Scan(&listener)
		if err != nil {
			return nil, err
		}
		var received *shop.Timestamp
		var receivedTime *time.Time
		err = t.QueryRow(ctx, "SELECT max(received_at) FROM bank_sms_receipts WHERE shop_id=$1", t.ShopID).Scan(&receivedTime)
		if receivedTime != nil {
			value := shop.Stamp(*receivedTime)
			received = &value
		}
		if err != nil {
			return nil, err
		}
		url := ""
		if listener != nil {
			url = a.Service.PublicURL + "/hooks/sms/" + *listener + "/raw"
		}
		connected, err := a.Service.HasTarget(ctx, t, "chatbot")
		if err != nil {
			return nil, err
		}
		v := shop.Integrations{SMS: shop.SmsListener{Connected: listener != nil, WebhookURL: url, Token: "", LastReceivedAt: received}}
		failures, err := a.smsReceipts(ctx, t)
		if err != nil {
			return nil, err
		}
		return map[string]any{"facebook": v.Facebook, "instagram": v.Instagram, "sms": map[string]any{"connected": listener != nil, "webhookUrl": url, "token": "", "senderNumber": "131917", "deviceLabel": "iPhone", "lastReceivedAt": received, "failures": failures}, "chatbot": map[string]bool{"connected": connected}}, nil
	})
}
func (a *Server) configureWebhook(c *echo.Context) error {
	var in struct {
		URL    string `json:"url"`
		Secret string `json:"secret"`
	}
	if err := decode(c, &in); err != nil {
		return err
	}
	if delivery.ValidateURL(in.URL) != nil || len(in.Secret) < 32 || len(in.Secret) > 256 {
		return shop.Invalid()
	}
	return a.tx(c, true, func(ctx context.Context, t *store.Tx) (any, error) {
		_, err := t.Exec(ctx, "INSERT INTO webhook_targets(shop_id,kind,url,secret) VALUES($1,'chatbot',$2,$3) ON CONFLICT(shop_id,kind) DO UPDATE SET url=excluded.url,secret=excluded.secret", t.ShopID, in.URL, in.Secret)
		return map[string]bool{"connected": true}, err
	})
}
func (a *Server) deleteWebhook(c *echo.Context) error {
	return a.tx(c, true, func(ctx context.Context, t *store.Tx) (any, error) {
		_, err := t.Exec(ctx, "DELETE FROM webhook_targets WHERE shop_id=$1 AND kind='chatbot'", t.ShopID)
		return nil, err
	})
}
func (a *Server) upload(c *echo.Context) error {
	file, err := c.FormFile("file")
	if err != nil {
		return shop.Invalid()
	}
	if file.Size > 10<<20 {
		return shop.Invalid()
	}
	reader, err := file.Open()
	if err != nil {
		return err
	}
	defer reader.Close()
	data, err := io.ReadAll(io.LimitReader(reader, (10<<20)+1))
	if err != nil {
		return err
	}
	if len(data) == 0 || len(data) > 10<<20 {
		return shop.Invalid()
	}
	mime := http.DetectContentType(data)
	switch mime {
	case "image/jpeg", "image/png", "image/webp":
	default:
		if len(data) >= 12 && string(data[4:8]) == "ftyp" && (string(data[8:12]) == "heic" || string(data[8:12]) == "heix") {
			mime = "image/heic"
		} else {
			return shop.Invalid()
		}
	}
	id := shop.ID()
	_, err = a.Service.DB.Pool.Exec(c.Request().Context(), "INSERT INTO uploads(id,shop_id,content_type,data) VALUES($1,$2,$3,$4)", id, identity(c).ShopID, mime, data)
	if err != nil {
		return err
	}
	return c.JSON(201, map[string]string{"url": strings.TrimRight(a.Service.PublicURL, "/") + "/media/" + id})
}
func (a *Server) media(c *echo.Context) error {
	var data []byte
	var mime string
	err := a.Service.DB.Pool.QueryRow(c.Request().Context(), "SELECT content_type,data FROM uploads WHERE id=$1", c.Param("id")).Scan(&mime, &data)
	if err != nil {
		return err
	}
	c.Response().Header().Set("X-Content-Type-Options", "nosniff")
	c.Response().Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	return c.Blob(200, mime, data)
}

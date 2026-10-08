// Package api exposes shop-owner, chatbot and bank-listener routes. Authentication
// fixes the tenant before invoking the shared shop service.
package api

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/labstack/echo/v5"
	"github.com/labstack/echo/v5/middleware"
	"online-shop/backend/internal/shop"
	"online-shop/backend/internal/store"
)

type Server struct {
	Service *shop.Service
	Echo    *echo.Echo
}

func New(s *shop.Service, origins []string) *Server {
	a := &Server{s, echo.New()}
	e := a.Echo
	e.IPExtractor = echo.ExtractIPDirect()
	e.Use(middleware.Recover(), middleware.RequestID(), middleware.BodyLimit(12<<20))
	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{AllowOrigins: origins, AllowMethods: []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"}, AllowHeaders: []string{"Authorization", "Content-Type", "Idempotency-Key", "X-Listener-Token"}}))
	e.HTTPErrorHandler = func(c *echo.Context, err error) { a.fail(c, err) }
	e.GET("/health", func(c *echo.Context) error {
		ctx, cancel := context.WithTimeout(c.Request().Context(), 2*time.Second)
		defer cancel()
		if err := s.DB.Pool.Ping(ctx); err != nil {
			return c.JSON(503, map[string]string{"status": "unavailable"})
		}
		return c.JSON(200, map[string]string{"status": "ok"})
	})
	e.Use(func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c *echo.Context) error {
			ctx, cancel := context.WithTimeout(c.Request().Context(), 20*time.Second)
			defer cancel()
			c.SetRequest(c.Request().WithContext(ctx))
			start := time.Now()
			err := next(c)
			slog.Info("http request", "method", c.Request().Method, "path", c.Path(), "duration", time.Since(start), "failed", err != nil)
			return err
		}
	})
	a.routes()
	return a
}
func (a *Server) fail(c *echo.Context, err error) {
	code, status, message := "internal", 500, "Серверийн алдаа гарлаа."
	var de *shop.Error
	var he *echo.HTTPError
	var pe *pgconn.PgError
	switch {
	case errors.As(err, &de):
		status, code, message = de.Status, de.Code, de.Message
	case errors.Is(err, pgx.ErrNoRows):
		status, code, message = 404, "not_found", "Мэдээлэл олдсонгүй."
	case errors.As(err, &pe) && pe.Code == "23505":
		status, code, message = 409, "conflict", "Давхардсан мэдээлэл байна."
	case errors.As(err, &pe) && (pe.Code == "40001" || pe.Code == "40P01"):
		status, code, message = 409, "conflict", "Мэдээлэл өөрчлөгдсөн байна. Дахин оролдоно уу."
	case errors.As(err, &he):
		status = he.Code
		message = http.StatusText(status)
		switch status {
		case 400, 422:
			code = "validation"
		case 401:
			code = "unauthorized"
		case 404:
			code = "not_found"
		case 405:
			code = "method_not_allowed"
		case 413:
			code = "payload_too_large"
		case 429:
			code = "rate_limited"
		default:
			code = "internal"
		}
	}
	if status >= 500 {
		slog.Error("request failed", "method", c.Request().Method, "path", c.Request().URL.Path, "error", err)
	}
	_ = c.JSON(status, map[string]any{"error": map[string]string{"code": code, "message": message}})
}
func identity(c *echo.Context) shop.Identity { return c.Get("identity").(shop.Identity) }
func (a *Server) auth(role string) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c *echo.Context) error {
			var token string
			if role == "bank" && c.Request().Header.Get("X-Listener-Token") != "" {
				token = c.Request().Header.Get("X-Listener-Token")
			} else {
				header := c.Request().Header.Get("Authorization")
				if !strings.HasPrefix(header, "Bearer ") {
					return shop.Unauthorized()
				}
				token = strings.TrimPrefix(header, "Bearer ")
			}
			i, err := a.Service.Authenticate(c.Request().Context(), token, role)
			if err != nil {
				return err
			}
			if listener := c.Param("listenerId"); listener != "" {
				var belongs bool
				err = a.Service.DB.Pool.QueryRow(c.Request().Context(), "SELECT EXISTS(SELECT 1 FROM service_keys WHERE token_hash=$1 AND shop_id=$2 AND listener_id=$3)", i.TokenHash, i.ShopID, listener).Scan(&belongs)
				if err != nil {
					return err
				}
				if !belongs {
					return shop.NotFound()
				}
			}
			c.Set("identity", i)
			return next(c)
		}
	}
}
func decode(c *echo.Context, out any) error {
	if !strings.HasPrefix(c.Request().Header.Get("Content-Type"), "application/json") {
		return shop.Invalid()
	}
	decoder := json.NewDecoder(c.Request().Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(out); err != nil {
		return shop.Invalid()
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		return shop.Invalid()
	}
	return nil
}
func (a *Server) tx(c *echo.Context, write bool, fn func(context.Context, *store.Tx) (any, error)) error {
	ctx := c.Request().Context()
	var result any
	err := a.Service.DB.Within(ctx, identity(c).ShopID, write, func(t *store.Tx) error { var err error; result, err = fn(ctx, t); return err })
	if err != nil {
		return err
	}
	if result == nil {
		return c.NoContent(204)
	}
	status := 200
	if c.Get("status") != nil {
		status = c.Get("status").(int)
	}
	return c.JSON(status, result)
}
func (a *Server) routes() {
	e, s := a.Echo, a.Service
	// Public authentication endpoints get an IP-based limiter. Credential lookup
	// still returns the same response for known and unknown accounts.
	authLimit := middleware.RateLimiter(middleware.NewRateLimiterMemoryStore(1))
	e.POST("/auth/login", func(c *echo.Context) error {
		var in struct {
			Phone    string `json:"phone"`
			Password string `json:"password"`
		}
		if err := decode(c, &in); err != nil {
			return err
		}
		v, err := s.Login(c.Request().Context(), in.Phone, in.Password)
		if err != nil {
			return err
		}
		return c.JSON(200, v)
	}, authLimit)
	e.POST("/auth/password-reset", func(c *echo.Context) error {
		var in struct {
			Phone string `json:"phone"`
		}
		if err := decode(c, &in); err != nil {
			return err
		}
		if err := s.RequestReset(c.Request().Context(), in.Phone); err != nil {
			return err
		}
		return c.JSON(200, map[string]string{"sentTo": "+976 " + in.Phone[:2] + "** **" + in.Phone[6:]})
	}, authLimit)
	e.POST("/auth/password-reset/confirm", func(c *echo.Context) error {
		var in struct {
			Phone       string `json:"phone"`
			Code        string `json:"code"`
			NewPassword string `json:"newPassword"`
		}
		if err := decode(c, &in); err != nil {
			return err
		}
		if err := s.ConfirmReset(c.Request().Context(), in.Phone, in.Code, in.NewPassword); err != nil {
			return err
		}
		return c.NoContent(204)
	}, authLimit)
	owner := e.Group("", a.auth("owner"))
	owner.POST("/auth/logout", func(c *echo.Context) error {
		if err := s.Logout(c.Request().Context(), identity(c)); err != nil {
			return err
		}
		return c.NoContent(204)
	})
	owner.POST("/auth/password", func(c *echo.Context) error {
		var in struct {
			CurrentPassword string `json:"currentPassword"`
			NewPassword     string `json:"newPassword"`
		}
		if err := decode(c, &in); err != nil {
			return err
		}
		return a.tx(c, true, func(ctx context.Context, t *store.Tx) (any, error) {
			return nil, s.ChangePassword(ctx, t, identity(c), in.CurrentPassword, in.NewPassword)
		})
	})
	owner.GET("/dashboard/today", func(c *echo.Context) error {
		return a.tx(c, false, func(ctx context.Context, t *store.Tx) (any, error) { return s.Today(ctx, t) })
	})
	owner.GET("/products", a.products)
	owner.GET("/products/:id", a.product)
	owner.POST("/products", func(c *echo.Context) error { c.Set("status", 201); return a.saveProduct(c) })
	owner.PUT("/products/:id", a.saveProduct)
	owner.PATCH("/products/:id", func(c *echo.Context) error {
		var in struct {
			Price int64 `json:"price"`
		}
		if err := decode(c, &in); err != nil {
			return err
		}
		var updated shop.Product
		err := a.tx(c, true, func(ctx context.Context, t *store.Tx) (any, error) {
			var err error
			updated, err = s.Price(ctx, t, c.Param("id"), in.Price)
			return updated, err
		})
		if err == nil {
			slog.Info("product.price_updated", "shop_id", identity(c).ShopID, "product_id", updated.ID, "product_code", updated.Code, "price", updated.Price)
		}
		return err
	})
	owner.DELETE("/products/:id", func(c *echo.Context) error {
		var deleted shop.Product
		err := a.tx(c, true, func(ctx context.Context, t *store.Tx) (any, error) {
			var err error
			deleted, err = s.Product(ctx, t, c.Param("id"))
			if err != nil {
				return nil, err
			}
			return nil, t.Delete(ctx, "products", c.Param("id"))
		})
		if err == nil {
			slog.Info("product.deleted", "shop_id", identity(c).ShopID, "product_id", deleted.ID, "product_code", deleted.Code)
		}
		return err
	})
	owner.GET("/products/:id/preorder", func(c *echo.Context) error {
		q, err := shop.ParseQuery(c.QueryParams(), false)
		if err != nil {
			return err
		}
		return a.tx(c, false, func(ctx context.Context, t *store.Tx) (any, error) { return s.Preorder(ctx, t, c.Param("id"), q) })
	})
	owner.POST("/products/:id/preorder/status", func(c *echo.Context) error {
		var in struct {
			Status shop.PreorderStatus `json:"status"`
		}
		if err := decode(c, &in); err != nil {
			return err
		}
		var updated shop.Product
		err := a.tx(c, true, func(ctx context.Context, t *store.Tx) (any, error) {
			var err error
			updated, err = s.PreorderStatus(ctx, t, c.Param("id"), in.Status)
			return updated, err
		})
		if err == nil {
			slog.Info("product.preorder_status_updated", "shop_id", identity(c).ShopID, "product_id", updated.ID, "product_code", updated.Code, "status", updated.Preorder.Status)
		}
		return err
	})
	owner.GET("/orders", func(c *echo.Context) error { return a.orders(c, false) })
	owner.GET("/orders/search", func(c *echo.Context) error { return a.orders(c, true) })
	owner.GET("/orders/:id", a.order)
	owner.PATCH("/orders/:id", a.updateOrder)
	owner.POST("/orders/fulfillment", func(c *echo.Context) error {
		var in struct {
			OrderIDs  []string `json:"orderIds"`
			Fulfilled *bool    `json:"fulfilled"`
		}
		if err := decode(c, &in); err != nil {
			return err
		}
		if in.Fulfilled == nil {
			return shop.Invalid()
		}
		return a.tx(c, true, func(ctx context.Context, t *store.Tx) (any, error) {
			return s.Fulfill(ctx, t, in.OrderIDs, *in.Fulfilled)
		})
	})
	owner.POST("/orders/:id/cancel", func(c *echo.Context) error {
		var in struct {
			Reason *string `json:"reason"`
		}
		if err := decode(c, &in); err != nil {
			return err
		}
		return a.tx(c, true, func(ctx context.Context, t *store.Tx) (any, error) { return s.Cancel(ctx, t, c.Param("id"), in.Reason) })
	})
	owner.POST("/orders/:id/restore", func(c *echo.Context) error {
		return a.tx(c, true, func(ctx context.Context, t *store.Tx) (any, error) { return s.Restore(ctx, t, c.Param("id")) })
	})
	owner.GET("/reports/summary", func(c *echo.Context) error {
		q, err := shop.ParseQuery(c.QueryParams(), true)
		if err != nil {
			return err
		}
		return a.tx(c, false, func(ctx context.Context, t *store.Tx) (any, error) { return s.Report(ctx, t, q) })
	})
	owner.GET("/review/summary", func(c *echo.Context) error {
		return a.tx(c, false, func(ctx context.Context, t *store.Tx) (any, error) { return s.ReviewSummary(ctx, t) })
	})
	owner.GET("/review/cases", func(c *echo.Context) error {
		q, err := shop.ParseQuery(c.QueryParams(), true)
		if err != nil {
			return err
		}
		return a.tx(c, false, func(ctx context.Context, t *store.Tx) (any, error) { return s.Cases(ctx, t, q) })
	})
	owner.GET("/review/cases/:id", func(c *echo.Context) error {
		return a.tx(c, false, func(ctx context.Context, t *store.Tx) (any, error) { return s.Case(ctx, t, c.Param("id")) })
	})
	owner.GET("/review/cases/:id/candidates", func(c *echo.Context) error {
		if c.QueryParam("q") == "" {
			return shop.Invalid()
		}
		return a.tx(c, false, func(ctx context.Context, t *store.Tx) (any, error) {
			v, err := s.Case(ctx, t, c.Param("id"))
			if err != nil {
				return nil, err
			}
			return s.Candidates(ctx, t, v, c.QueryParam("q"))
		})
	})
	owner.POST("/review/cases/:id/resolve", func(c *echo.Context) error {
		var in shop.ResolveCaseInput
		if err := decode(c, &in); err != nil {
			return err
		}
		return a.tx(c, true, func(ctx context.Context, t *store.Tx) (any, error) { return s.Resolve(ctx, t, c.Param("id"), in) })
	})
	owner.POST("/review/cases/:id/contact", func(c *echo.Context) error {
		var in struct {
			OrderID string `json:"orderId"`
			Message string `json:"message"`
		}
		if err := decode(c, &in); err != nil {
			return err
		}
		return a.tx(c, true, func(ctx context.Context, t *store.Tx) (any, error) {
			return s.Contact(ctx, t, c.Param("id"), in.OrderID, in.Message)
		})
	})
	owner.POST("/review/cases/:id/refunded", func(c *echo.Context) error {
		return a.tx(c, true, func(ctx context.Context, t *store.Tx) (any, error) { return s.Refunded(ctx, t, c.Param("id")) })
	})
	owner.POST("/review/cases/:id/reopen", func(c *echo.Context) error {
		return a.tx(c, true, func(ctx context.Context, t *store.Tx) (any, error) { return s.Reopen(ctx, t, c.Param("id")) })
	})
	owner.GET("/settings", a.settings)
	owner.PUT("/settings/bank-account", func(c *echo.Context) error {
		var in shop.BankAccount
		if err := decode(c, &in); err != nil {
			return err
		}
		return a.tx(c, true, func(ctx context.Context, t *store.Tx) (any, error) { return s.SetBank(ctx, t, in) })
	})
	owner.POST("/uploads/images", a.upload)
	e.GET("/media/:id", a.media)
	owner.GET("/integrations", a.integrations)
	owner.PUT("/integrations/chatbot", a.configureWebhook)
	owner.DELETE("/integrations/chatbot", a.deleteWebhook)
	// Legacy direct-Meta routes remain explicit unsupported capabilities. Make /
	// Zapier owns Meta authorization; we never pretend an OAuth connection exists.
	owner.POST("/integrations/meta/:platform/connect", func(c *echo.Context) error {
		return &shop.Error{Status: 501, Code: "not_supported", Message: "Meta холболтыг Make эсвэл Zapier дээр тохируулна уу."}
	})
	owner.DELETE("/integrations/meta/:platform", func(c *echo.Context) error {
		return &shop.Error{Status: 501, Code: "not_supported", Message: "Meta холболтыг Make эсвэл Zapier дээр тохируулна уу."}
	})
	e.GET("/integrations/meta/callback", func(c *echo.Context) error {
		return &shop.Error{Status: 501, Code: "not_supported", Message: "Meta холболтыг Make эсвэл Zapier дээр тохируулна уу."}
	})
	bot := e.Group("/chatbot", a.auth("chatbot"))
	bot.GET("/products", a.products)
	bot.GET("/products/:id", a.product)
	bot.GET("/settings", a.settings)
	bot.POST("/orders", a.createOrder)
	bot.GET("/orders/:id", a.botOrder)
	bot.PATCH("/orders/:id/delivery", a.botDelivery)
	bank := e.Group("/bank", a.auth("bank"))
	bank.POST("/transactions", a.payment)
	// Compatibility URL for phone listeners; accepts normalized JSON transactions.
	e.POST("/hooks/sms/:listenerId", a.payment, a.auth("bank"))
}
func (a *Server) products(c *echo.Context) error {
	q, err := shop.ParseQuery(c.QueryParams(), false)
	if err != nil {
		return err
	}
	return a.tx(c, false, func(ctx context.Context, t *store.Tx) (any, error) { return a.Service.Products(ctx, t, q) })
}
func (a *Server) product(c *echo.Context) error {
	return a.tx(c, false, func(ctx context.Context, t *store.Tx) (any, error) { return a.Service.Product(ctx, t, c.Param("id")) })
}
func (a *Server) saveProduct(c *echo.Context) error {
	var in shop.ProductInput
	if err := decode(c, &in); err != nil {
		return err
	}
	var saved shop.Product
	err := a.tx(c, true, func(ctx context.Context, t *store.Tx) (any, error) {
		var err error
		saved, err = a.Service.SaveProduct(ctx, t, c.Param("id"), in)
		return saved, err
	})
	if err == nil {
		action := "product.updated"
		if c.Request().Method == http.MethodPost {
			action = "product.created"
		}
		slog.Info(action, "shop_id", identity(c).ShopID, "product_id", saved.ID, "product_code", saved.Code, "sale_type", saved.SaleType)
	}
	return err
}
func (a *Server) orders(c *echo.Context, search bool) error {
	q, err := shop.ParseQuery(c.QueryParams(), true)
	if err != nil {
		return err
	}
	return a.tx(c, false, func(ctx context.Context, t *store.Tx) (any, error) { return a.Service.Orders(ctx, t, q, search) })
}
func (a *Server) order(c *echo.Context) error {
	return a.tx(c, false, func(ctx context.Context, t *store.Tx) (any, error) { return a.Service.Order(ctx, t, c.Param("id")) })
}
func (a *Server) updateOrder(c *echo.Context) error {
	var in map[string]json.RawMessage
	if err := decode(c, &in); err != nil {
		return err
	}
	if in == nil {
		return shop.Invalid()
	}
	return a.tx(c, true, func(ctx context.Context, t *store.Tx) (any, error) {
		return a.Service.UpdateOrder(ctx, t, c.Param("id"), in)
	})
}
func (a *Server) settings(c *echo.Context) error {
	return a.tx(c, false, func(ctx context.Context, t *store.Tx) (any, error) { return a.Service.Settings(ctx, t) })
}
func (a *Server) createOrder(c *echo.Context) error {
	var in shop.CreateOrderInput
	if err := decode(c, &in); err != nil {
		return err
	}
	c.Set("status", 201)
	return a.tx(c, true, func(ctx context.Context, t *store.Tx) (any, error) {
		o, err := shop.Idempotent(ctx, t, "chatbot/orders", c.Request().Header.Get("Idempotency-Key"), in, func() (shop.Order, error) { return a.Service.CreateOrder(ctx, t, in) })
		return botOrder(o), err
	})
}
func (a *Server) payment(c *echo.Context) error {
	var in shop.PaymentInput
	if err := decode(c, &in); err != nil {
		return err
	}
	c.Set("status", 202)
	return a.tx(c, true, func(ctx context.Context, t *store.Tx) (any, error) {
		return shop.Idempotent(ctx, t, "bank/transactions", in.ExternalID, in, func() (shop.PaymentResult, error) { return a.Service.Payment(ctx, t, in) })
	})
}

// Owner notes are never exposed to the chatbot integration.
func botOrder(o shop.Order) map[string]any {
	raw, _ := json.Marshal(o)
	var v map[string]any
	_ = json.Unmarshal(raw, &v)
	delete(v, "sellerNote")
	return v
}
func (a *Server) botOrder(c *echo.Context) error {
	return a.tx(c, false, func(ctx context.Context, t *store.Tx) (any, error) {
		o, err := a.Service.Order(ctx, t, c.Param("id"))
		return botOrder(o), err
	})
}
func (a *Server) botDelivery(c *echo.Context) error {
	var in map[string]json.RawMessage
	if err := decode(c, &in); err != nil {
		return err
	}
	if len(in) == 0 {
		return shop.Invalid()
	}
	for k := range in {
		if k != "customerPhone" && k != "deliveryAddress" {
			return shop.Invalid()
		}
	}
	return a.tx(c, true, func(ctx context.Context, t *store.Tx) (any, error) {
		o, err := a.Service.UpdateOrder(ctx, t, c.Param("id"), in)
		return botOrder(o), err
	})
}

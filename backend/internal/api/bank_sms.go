package api

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/labstack/echo/v5"
	"online-shop/backend/internal/shop"
	"online-shop/backend/internal/store"
)

func (a *Server) rotateSMS(c *echo.Context) error {
	return a.tx(c, true, func(ctx context.Context, t *store.Tx) (any, error) {
		token, listener := shop.ID()+shop.ID(), "sms-"+shop.ID()
		if _, err := t.Exec(ctx, "DELETE FROM service_keys WHERE shop_id=$1 AND role='bank' AND listener_id LIKE 'sms-%'", t.ShopID); err != nil {
			return nil, err
		}
		if _, err := t.Exec(ctx, "INSERT INTO service_keys(token_hash,shop_id,role,listener_id) VALUES($1,$2,'bank',$3)", shop.Hash(token), t.ShopID, listener); err != nil {
			return nil, err
		}
		c.Response().Header().Set("Cache-Control", "no-store")
		return map[string]string{"token": token, "webhookUrl": a.Service.PublicURL + "/hooks/sms/" + listener + "/raw"}, nil
	})
}

func (a *Server) rawSMS(c *echo.Context) error {
	var in struct {
		ID         string `json:"id"`
		Sender     string `json:"sender"`
		Message    string `json:"message"`
		ReceivedAt string `json:"receivedAt"`
	}
	if err := decode(c, &in); err != nil {
		return &shop.Error{Status: 422, Code: "validation", Message: "Request Body must be JSON with Text fields: id, sender, message (and optional receivedAt)."}
	}
	if len(in.ID) < 1 || len(in.ID) > 200 {
		return &shop.Error{Status: 422, Code: "validation", Message: "id must contain the EventID text (1–200 characters)."}
	}
	if in.Sender != "131917" {
		return &shop.Error{Status: 422, Code: "validation", Message: "sender must be Text containing exactly 131917."}
	}
	if len(in.Message) == 0 || len(in.Message) > 10000 {
		return &shop.Error{Status: 422, Code: "validation", Message: "message is empty or too long. Select the incoming Message Content as BankMessage. Running manually does not supply an incoming SMS."}
	}
	at := time.Now().UTC()
	if in.ReceivedAt != "" {
		var err error
		at, err = time.Parse(time.RFC3339Nano, in.ReceivedAt)
		if err != nil {
			return shop.Invalid()
		}
	}
	c.Set("status", 202)
	return a.tx(c, true, func(ctx context.Context, t *store.Tx) (any, error) {
		var sender, raw, timestamp string
		var previous json.RawMessage
		err := t.QueryRow(ctx, "SELECT sender,raw_message,received_at::text,response FROM bank_sms_receipts WHERE shop_id=$1 AND id=$2", t.ShopID, in.ID).Scan(&sender, &raw, &timestamp, &previous)
		if err == nil {
			if sender != in.Sender || raw != in.Message {
				return nil, shop.Conflict()
			}
			// The first receipt fixes its timestamp; retries return the original result.
			return previous, nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return nil, err
		}
		settings, err := a.Service.Settings(ctx, t)
		if err != nil {
			return nil, err
		}
		account := ""
		if settings.BankAccount != nil {
			account = settings.BankAccount.AccountNumber
		}
		payment, parseErr := shop.ParseKhanSMS(in.Message, account)
		if settings.BankAccount != nil && settings.BankAccount.Bank != "Хаан банк" && settings.BankAccount.Bank != "Khan Bank" {
			parseErr = errors.New("bank_mismatch")
		}
		status, reason := "processed", ""
		var result any
		if parseErr != nil {
			status, reason = "needs_review", parseErr.Error()
		} else {
			payment.ExternalID = "sms:" + in.ID
			payment.ReceivedAt = at.Format(time.RFC3339Nano)
			result, err = a.Service.Payment(ctx, t, payment)
			if err != nil {
				return nil, err
			}
		}
		response := map[string]any{"id": in.ID, "status": status, "reason": reason, "result": result}
		body, err := json.Marshal(response)
		if err != nil {
			return nil, err
		}
		_, err = t.Exec(ctx, "INSERT INTO bank_sms_receipts(shop_id,id,sender,raw_message,received_at,status,reason,response) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", t.ShopID, in.ID, in.Sender, in.Message, at, status, reason, body)
		return response, err
	})
}

func (a *Server) smsReceipts(ctx context.Context, t *store.Tx) ([]map[string]any, error) {
	rows, err := t.Query(ctx, "SELECT id,raw_message,received_at,reason FROM bank_sms_receipts WHERE shop_id=$1 AND status='needs_review' ORDER BY received_at DESC LIMIT 20", t.ShopID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, message, reason string
		var at time.Time
		if err := rows.Scan(&id, &message, &at, &reason); err != nil {
			return nil, err
		}
		out = append(out, map[string]any{"id": id, "message": message, "receivedAt": at, "reason": strings.ReplaceAll(reason, "_", " ")})
	}
	return out, rows.Err()
}

package shop

import (
	"errors"
	"regexp"
	"strconv"
	"strings"
)

var khanSMS = regexp.MustCompile(`^Khan Bank:Tany ([0-9*]+) dansand ORLOGO:([0-9]+(?:,[0-9]{3})*)(?:\.00)?MNT orj ULDEGDEL:[0-9]+(?:,[0-9]{3})*(?:\.00)?MNT bolloo\.Utga:(.*)$`)

// ParseKhanSMS accepts only the observed incoming-transfer format. It never
// treats a balance, masked account number, or inferred name as a payment code.
func ParseKhanSMS(raw, account string) (PaymentInput, error) {
	m := khanSMS.FindStringSubmatch(strings.TrimSpace(raw))
	if m == nil {
		return PaymentInput{}, errors.New("unrecognized_message")
	}
	if account == "" {
		return PaymentInput{}, errors.New("bank_account_not_configured")
	}
	pattern := "^" + strings.ReplaceAll(regexp.QuoteMeta(m[1]), `\*`, `[0-9]*`) + "$"
	if len(account) <= len(strings.ReplaceAll(m[1], "*", "")) || !regexp.MustCompile(pattern).MatchString(account) {
		return PaymentInput{}, errors.New("account_mismatch")
	}
	amount, err := strconv.ParseInt(strings.ReplaceAll(m[2], ",", ""), 10, 64)
	if err != nil || amount < 1 || amount > 9_000_000_000_000_000 {
		return PaymentInput{}, errors.New("invalid_amount")
	}
	if len(strings.TrimSpace(m[3])) > 1000 {
		return PaymentInput{}, errors.New("unrecognized_message")
	}
	return PaymentInput{Amount: amount, Bank: "Khan Bank", Note: strings.TrimSpace(m[3]), RawMessage: raw}, nil
}

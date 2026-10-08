// Package shop defines shared business models for all HTTP entry points.
package shop

import "encoding/json"

type Money int64

type Timestamp string

type User struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	ShopName string `json:"shopName"`
	Phone    string `json:"phone"`
}

type ProductVariant struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Quantity int64  `json:"quantity"`
}

type SaleType string

type PreorderStatus string

type PreorderSettings struct {
	ClosesOn    *string `json:"closesOn"`
	ArrivalNote *string `json:"arrivalNote"`
	Limit       *int64  `json:"limit"`
}

type PreorderInfo struct {
	ClosesOn    *string        `json:"closesOn"`
	ArrivalNote *string        `json:"arrivalNote"`
	Limit       *int64         `json:"limit"`
	Status      PreorderStatus `json:"status"`
	Ordered     int64          `json:"ordered"`
	Paid        int64          `json:"paid"`
}

type PreorderTallyRow struct {
	VariantName *string `json:"variantName"`
	Ordered     int64   `json:"ordered"`
	Paid        int64   `json:"paid"`
}

type PreorderDetail struct {
	Product    Product            `json:"product"`
	Tally      []PreorderTallyRow `json:"tally"`
	Orders     []Order            `json:"orders"`
	Total      int64              `json:"total"`
	NextCursor NextCursor         `json:"nextCursor"`
}

type Product struct {
	ID         string           `json:"id"`
	Code       string           `json:"code"`
	CodeSource string           `json:"codeSource"`
	SaleType   SaleType         `json:"saleType"`
	Name       string           `json:"name"`
	Price      Money            `json:"price"`
	ImageURL   *string          `json:"imageUrl"`
	Variants   []ProductVariant `json:"variants"`
	Stock      int64            `json:"stock"`
	Preorder   *PreorderInfo    `json:"preorder"`
	CreatedAt  Timestamp        `json:"createdAt"`
}

type ProductInput struct {
	SaleType SaleType          `json:"saleType"`
	Preorder *PreorderSettings `json:"preorder"`
	Name     string            `json:"name"`
	Price    int64             `json:"price"`
	ImageURL *string           `json:"imageUrl"`
	Code     *string           `json:"code"`
	Variants []struct {
		Name     string `json:"name"`
		Quantity int64  `json:"quantity"`
	} `json:"variants"`
	Stock int64 `json:"stock"`
}

type Channel string

type OrderItem struct {
	ProductID   string  `json:"productId"`
	ProductName string  `json:"productName"`
	VariantName *string `json:"variantName"`
	Quantity    int64   `json:"quantity"`
	UnitPrice   Money   `json:"unitPrice"`
}

type Order struct {
	CustomerPhone   *string     `json:"customerPhone"`
	DeliveryAddress *string     `json:"deliveryAddress"`
	SellerNote      *string     `json:"sellerNote"`
	FulfilledAt     *Timestamp  `json:"fulfilledAt"`
	CancelledAt     *Timestamp  `json:"cancelledAt"`
	CancelReason    *string     `json:"cancelReason"`
	ChatURL         *string     `json:"chatUrl"`
	ID              string      `json:"id"`
	Code            string      `json:"code"`
	CustomerName    string      `json:"customerName"`
	Channel         Channel     `json:"channel"`
	Items           []OrderItem `json:"items"`
	Total           Money       `json:"total"`
	Status          string      `json:"status"`
	CreatedAt       Timestamp   `json:"createdAt"`
	PaidAt          *Timestamp  `json:"paidAt"`
	MatchedBy       *string     `json:"matchedBy"`
}

type OrderView string

type NextCursor *string

type ProductPage struct {
	Products   []Product  `json:"products"`
	Total      int64      `json:"total"`
	NextCursor NextCursor `json:"nextCursor"`
}

type ReviewCasePage struct {
	Cases      []ReviewCase `json:"cases"`
	Total      int64        `json:"total"`
	NextCursor NextCursor   `json:"nextCursor"`
}

type OrderPage struct {
	Orders     []Order    `json:"orders"`
	Total      int64      `json:"total"`
	NextCursor NextCursor `json:"nextCursor"`
}

type OrderUpdate struct {
	CustomerPhone   *string   `json:"customerPhone"`
	DeliveryAddress *string   `json:"deliveryAddress"`
	SellerNote      *string   `json:"sellerNote"`
	ItemVariants    []*string `json:"itemVariants"`
}

type BankAccount struct {
	Bank          string `json:"bank"`
	AccountNumber string `json:"accountNumber"`
	AccountHolder string `json:"accountHolder"`
}

type ShopSettings struct {
	BankAccount *BankAccount `json:"bankAccount"`
}

type TodaySummary struct {
	Revenue       Money   `json:"revenue"`
	PaidCount     int64   `json:"paidCount"`
	AwaitingCount int64   `json:"awaitingCount"`
	ReviewCount   int64   `json:"reviewCount"`
	Recent        []Order `json:"recent"`
}

type ReportSummary struct {
	From                  string `json:"from"`
	To                    string `json:"to"`
	Revenue               Money  `json:"revenue"`
	PaidCount             int64  `json:"paidCount"`
	AwaitingCount         int64  `json:"awaitingCount"`
	UnmatchedPaymentCount int64  `json:"unmatchedPaymentCount"`
	ByChannel             []struct {
		Channel Channel `json:"channel"`
		Count   int64   `json:"count"`
	} `json:"byChannel"`
	TopProducts []struct {
		ProductID string `json:"productId"`
		Name      string `json:"name"`
		Quantity  int64  `json:"quantity"`
		Revenue   Money  `json:"revenue"`
	} `json:"topProducts"`
}

type BankPayment struct {
	ID         string    `json:"id"`
	Amount     Money     `json:"amount"`
	SenderName string    `json:"senderName"`
	Note       string    `json:"note"`
	Bank       string    `json:"bank"`
	ReceivedAt Timestamp `json:"receivedAt"`
	RawMessage string    `json:"rawMessage"`
}

type MatchSignal struct {
	Level string `json:"level"`
	Text  string `json:"text"`
}

type MatchCandidate struct {
	Order   Order         `json:"order"`
	Signals []MatchSignal `json:"signals"`
	Summary string        `json:"summary"`
}

type DifferenceAction string

type CaseResolutionMatched struct {
	Kind             string            `json:"kind"`
	OrderID          string            `json:"orderId"`
	OrderCode        string            `json:"orderCode"`
	CustomerName     string            `json:"customerName"`
	Difference       int64             `json:"difference"`
	DifferenceAction *DifferenceAction `json:"differenceAction"`
	ResolvedAt       Timestamp         `json:"resolvedAt"`
}

type CaseResolutionNoOrder struct {
	Kind       string          `json:"kind"`
	Category   NoOrderCategory `json:"category"`
	ResolvedAt Timestamp       `json:"resolvedAt"`
}

type NoOrderCategory string

type ReviewCase struct {
	ID         string           `json:"id"`
	Payment    BankPayment      `json:"payment"`
	Reason     string           `json:"reason"`
	Status     string           `json:"status"`
	Suggestion *MatchCandidate  `json:"suggestion"`
	Candidates []MatchCandidate `json:"candidates"`
	Contact    *CaseContact     `json:"contact"`
	Refund     *CaseRefund      `json:"refund"`
	Resolution *CaseResolution  `json:"resolution"`
	Note       *string          `json:"note"`
}

type CaseContact struct {
	OrderID      string    `json:"orderId"`
	CustomerName string    `json:"customerName"`
	Message      string    `json:"message"`
	SentAt       Timestamp `json:"sentAt"`
}

type CaseRefund struct {
	Amount Money      `json:"amount"`
	Status string     `json:"status"`
	DoneAt *Timestamp `json:"doneAt"`
}

type ReviewSummary struct {
	Open           int64 `json:"open"`
	Waiting        int64 `json:"waiting"`
	RefundsPending int64 `json:"refundsPending"`
}

type ResolveMatched struct {
	Kind             string            `json:"kind"`
	OrderID          string            `json:"orderId"`
	DifferenceAction *DifferenceAction `json:"differenceAction"`
	Note             *string           `json:"note"`
}

type ResolveNoOrder struct {
	Kind     string          `json:"kind"`
	Category NoOrderCategory `json:"category"`
	Note     *string         `json:"note"`
}

type MetaPlatform string

type MetaConnection struct {
	Connected   bool       `json:"connected"`
	AccountName *string    `json:"accountName"`
	ConnectedAt *Timestamp `json:"connectedAt"`
}

type SmsListener struct {
	Connected      bool       `json:"connected"`
	WebhookURL     string     `json:"webhookUrl"`
	Token          string     `json:"token"`
	SenderNumber   *string    `json:"senderNumber"`
	DeviceLabel    *string    `json:"deviceLabel"`
	LastReceivedAt *Timestamp `json:"lastReceivedAt"`
}

type Integrations struct {
	Facebook  MetaConnection `json:"facebook"`
	Instagram MetaConnection `json:"instagram"`
	SMS       SmsListener    `json:"sms"`
}

type CaseResolution struct {
	Kind             string            `json:"kind"`
	OrderID          string            `json:"orderId,omitempty"`
	OrderCode        string            `json:"orderCode,omitempty"`
	CustomerName     string            `json:"customerName,omitempty"`
	Difference       int64             `json:"difference,omitempty"`
	DifferenceAction *DifferenceAction `json:"differenceAction"`
	Category         NoOrderCategory   `json:"category,omitempty"`
	ResolvedAt       Timestamp         `json:"resolvedAt"`
}
type ResolveCaseInput struct {
	Kind             string            `json:"kind"`
	OrderID          string            `json:"orderId"`
	DifferenceAction *DifferenceAction `json:"differenceAction"`
	Category         NoOrderCategory   `json:"category"`
	Note             *string           `json:"note"`
}
type Session struct {
	Token string `json:"token"`
	User  User   `json:"user"`
}
type CreateOrderInput struct {
	CustomerName    string  `json:"customerName"`
	Channel         Channel `json:"channel"`
	CustomerPhone   *string `json:"customerPhone"`
	DeliveryAddress *string `json:"deliveryAddress"`
	ConversationID  string  `json:"conversationId"`
	ChatURL         *string `json:"chatUrl"`
	Items           []struct {
		ProductID   string  `json:"productId"`
		VariantName *string `json:"variantName"`
		Quantity    int64   `json:"quantity"`
	} `json:"items"`
}
type PaymentInput struct {
	ExternalID string `json:"externalId"`
	Amount     int64  `json:"amount"`
	SenderName string `json:"senderName"`
	Note       string `json:"note"`
	Bank       string `json:"bank"`
	ReceivedAt string `json:"receivedAt"`
	RawMessage string `json:"rawMessage"`
}

func (r CaseResolution) MarshalJSON() ([]byte, error) {
	if r.Kind == "matched" {
		return json.Marshal(CaseResolutionMatched{Kind: r.Kind, OrderID: r.OrderID, OrderCode: r.OrderCode, CustomerName: r.CustomerName, Difference: r.Difference, DifferenceAction: r.DifferenceAction, ResolvedAt: r.ResolvedAt})
	}
	return json.Marshal(CaseResolutionNoOrder{Kind: r.Kind, Category: r.Category, ResolvedAt: r.ResolvedAt})
}

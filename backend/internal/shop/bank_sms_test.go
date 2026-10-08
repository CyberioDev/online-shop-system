package shop

import "testing"

const sampleSMS = "Khan Bank:Tany 5***8198 dansand ORLOGO:10,000.00MNT orj ULDEGDEL:10,000.00MNT bolloo.Utga:myanganbayar-s martbayasgalan myanganbayar-d"

func TestParseKhanSMS(t *testing.T) {
	p, err := ParseKhanSMS(sampleSMS, "5123458198")
	if err != nil || p.Amount != 10000 || p.Note != "myanganbayar-s martbayasgalan myanganbayar-d" || p.SenderName != "" {
		t.Fatalf("unexpected parse: %+v %v", p, err)
	}
	for _, tc := range []struct{ raw, account string }{
		{sampleSMS, "5123459999"}, {sampleSMS, ""}, {sampleSMS, "58198"},
		{"Khan Bank: OTP 123456", "5123458198"},
		{"Khan Bank:Tany 5***8198 dansand ORLOGO:10,000.50MNT orj ULDEGDEL:10,000.00MNT bolloo.Utga:4827", "5123458198"},
	} {
		if _, err := ParseKhanSMS(tc.raw, tc.account); err == nil {
			t.Fatalf("accepted invalid SMS %q", tc.raw)
		}
	}
}

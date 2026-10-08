package delivery

import (
	"net"
	"testing"
)

func TestRejectPrivateDestinations(t *testing.T) {
	for _, ip := range []string{"127.0.0.1", "10.1.2.3", "192.168.0.1", "169.254.169.254", "::1", "fc00::1", "100.64.0.1", "64:ff9b::7f00:1"} {
		if publicIP(net.ParseIP(ip)) {
			t.Fatalf("allowed %s", ip)
		}
	}
	if !publicIP(net.ParseIP("8.8.8.8")) {
		t.Fatal("rejected public address")
	}
}
func TestWebhookURL(t *testing.T) {
	for _, raw := range []string{"http://example.com", "https://user:pass@example.com", "file:///etc/passwd", "https://example.com/#secret"} {
		if ValidateURL(raw) == nil {
			t.Fatalf("allowed %s", raw)
		}
	}
}

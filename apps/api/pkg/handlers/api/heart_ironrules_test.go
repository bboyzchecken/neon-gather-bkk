package api

import (
	"strings"
	"testing"
)

// §7 iron-rule test (b): no endpoint may convert real money into heart
// points. We assert it structurally on the real route table: nothing under
// /npc (or anywhere else touching hearts) exposes a purchase-shaped route.
func TestNoRealMoneyHeartRoutes(t *testing.T) {
	s := &Server{}
	e := s.buildEcho()
	forbidden := []string{"buy", "purchase", "checkout", "payment", "stripe", "iap", "money"}
	for _, r := range e.Routes() {
		path := strings.ToLower(r.Path)
		if !strings.Contains(path, "npc") && !strings.Contains(path, "heart") {
			continue
		}
		for _, bad := range forbidden {
			if strings.Contains(path, bad) {
				t.Errorf("heart-system route %q looks like a real-money conversion (%q) — iron rule b forbids this", r.Path, bad)
			}
		}
	}
	// and the allowed action list is exactly what the design says
	allowed := map[string]bool{"talk": true, "tip": true, "gift": true}
	for _, r := range e.Routes() {
		if !strings.Contains(r.Path, "/npc/:id/") {
			continue
		}
		action := r.Path[strings.LastIndex(r.Path, "/")+1:]
		if !allowed[action] {
			t.Errorf("unexpected NPC action route %q — new heart actions need an iron-rule review first", r.Path)
		}
	}
}

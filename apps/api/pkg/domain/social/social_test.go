package social

import "testing"

func TestCanonicalPair(t *testing.T) {
	a, b, err := CanonicalPair("zed", "amy")
	if err != nil || a != "amy" || b != "zed" {
		t.Errorf("pair not canonical: %s,%s %v", a, b, err)
	}
	a2, b2, _ := CanonicalPair("amy", "zed")
	if a2 != a || b2 != b {
		t.Error("order must not matter")
	}
	if _, _, err := CanonicalPair("amy", "amy"); err == nil {
		t.Error("self-cheers must be rejected")
	}
}

func TestWithinCheersRange(t *testing.T) {
	if !WithinCheersRange(5, 5, 6.5, 6.5) { // ~2.12 tiles
		t.Error("adjacent players must be in range")
	}
	if WithinCheersRange(5, 5, 8, 8) { // ~4.24 tiles
		t.Error("far players must be out of range")
	}
	if !WithinCheersRange(5, 5, 5, 5) {
		t.Error("same tile is in range")
	}
}

func TestReachedRegular(t *testing.T) {
	if ReachedRegular(19, 20) {
		t.Error("19/20 is not regular yet")
	}
	if !ReachedRegular(20, 20) {
		t.Error("exactly 20 achieves regular")
	}
	if ReachedRegular(21, 20) {
		t.Error("regular is achieved ONCE, exactly at the threshold")
	}
	if ReachedRegular(0, 0) {
		t.Error("threshold<=0 never achieves")
	}
}

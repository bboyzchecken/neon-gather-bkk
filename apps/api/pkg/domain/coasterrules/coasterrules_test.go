package coasterrules

import (
	"testing"
	"time"
)

func TestIsOpeningNight(t *testing.T) {
	opened := time.Date(2026, 7, 10, 20, 0, 0, 0, time.UTC)
	cases := []struct {
		name string
		now  time.Time
		want bool
	}{
		{"just opened", opened.Add(time.Minute), true},
		{"day 6", opened.Add(6 * 24 * time.Hour), true},
		{"exactly 7 days — window closed forever", opened.Add(7 * 24 * time.Hour), false},
		{"day 8", opened.Add(8 * 24 * time.Hour), false},
		{"before opening", opened.Add(-time.Minute), false},
		{"zero openedAt", time.Time{}, false},
	}
	for _, c := range cases {
		now := c.now
		if c.name == "zero openedAt" {
			if IsOpeningNight(time.Time{}, opened) {
				t.Error("zero openedAt must never qualify")
			}
			continue
		}
		if got := IsOpeningNight(opened, now); got != c.want {
			t.Errorf("%s: IsOpeningNight = %v, want %v", c.name, got, c.want)
		}
	}
}

func TestCapAllows(t *testing.T) {
	if !CapAllows(0, 10) || !CapAllows(9, 10) {
		t.Error("under the cap must allow")
	}
	if CapAllows(10, 10) || CapAllows(11, 10) {
		t.Error("at/over the cap must refuse")
	}
	if !CapAllows(1000000, 0) {
		t.Error("cap<=0 means unlimited (dev default)")
	}
}

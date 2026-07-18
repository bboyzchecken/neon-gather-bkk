package questperiod

import (
	"testing"
	"time"
)

func TestKeyFor(t *testing.T) {
	// Saturday 2026-07-18 is in ISO week 29 of 2026.
	at := time.Date(2026, 7, 18, 15, 0, 0, 0, time.UTC)

	if got := KeyFor("MAIN", at); got != "-" {
		t.Errorf("MAIN key = %q", got)
	}
	if got := KeyFor("JOB", at); got != "-" {
		t.Errorf("JOB key = %q", got)
	}
	if got := KeyFor("DAILY", at); got != "2026-07-18" {
		t.Errorf("DAILY key = %q", got)
	}
	if got := KeyFor("WEEKLY", at); got != "2026-W29" {
		t.Errorf("WEEKLY key = %q", got)
	}
	if got := KeyFor("COMMUNITY", at); got != "2026-W29" {
		t.Errorf("COMMUNITY key = %q", got)
	}
}

func TestDailyRollsOver(t *testing.T) {
	d1 := time.Date(2026, 7, 18, 23, 59, 0, 0, time.UTC)
	d2 := time.Date(2026, 7, 19, 0, 1, 0, 0, time.UTC)
	if KeyFor("DAILY", d1) == KeyFor("DAILY", d2) {
		t.Error("daily key must change across midnight")
	}
	if KeyFor("WEEKLY", d1) != KeyFor("WEEKLY", d2) {
		t.Error("weekly key must NOT change within the same ISO week (Sat->Sun)")
	}
	// ISO weeks flip on Monday.
	mon := time.Date(2026, 7, 20, 0, 1, 0, 0, time.UTC)
	if KeyFor("WEEKLY", d2) == KeyFor("WEEKLY", mon) {
		t.Error("weekly key must change on Monday")
	}
}

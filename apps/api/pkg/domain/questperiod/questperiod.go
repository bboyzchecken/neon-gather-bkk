// Package questperiod holds pure quest-period math — unit-tested without a
// DB. Periods follow server time (global TZ is Asia/Bangkok, set in main).
package questperiod

import (
	"fmt"
	"time"
)

// NonPeriodic is the period key for quests that never reset (MAIN/JOB).
const NonPeriodic = "-"

// KeyFor returns the period bucket a quest occurrence belongs to at time t:
// MAIN/JOB -> "-", DAILY -> "2026-07-18", WEEKLY/COMMUNITY -> "2026-W29".
func KeyFor(questType string, t time.Time) string {
	switch questType {
	case "DAILY":
		return t.Format("2006-01-02")
	case "WEEKLY", "COMMUNITY":
		y, w := t.ISOWeek()
		return fmt.Sprintf("%d-W%02d", y, w)
	default:
		return NonPeriodic
	}
}

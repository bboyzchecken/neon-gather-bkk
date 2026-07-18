// Package coasterrules holds pure coaster-issuance rules — unit-tested
// without a DB. Iron rule: opening-night eligibility is decided by SERVER
// time against the shop's opening timestamp, never by anything the client
// sends, and the window never reopens.
package coasterrules

import "time"

// OpeningWindow is how long a shop counts as "just opened".
const OpeningWindow = 7 * 24 * time.Hour

// IsOpeningNight reports whether now is inside the shop's opening-night
// window. openedAt is the plot's rented_at (server-set).
func IsOpeningNight(openedAt, now time.Time) bool {
	if openedAt.IsZero() || now.Before(openedAt) {
		return false
	}
	return now.Sub(openedAt) < OpeningWindow
}

// CapAllows reports whether one more coaster may be issued for a shop's
// season given the current issued count and the configured cap.
// cap <= 0 means "no cap configured" and always allows (dev default).
func CapAllows(issued, cap int) bool {
	if cap <= 0 {
		return true
	}
	return issued < cap
}

// Package social holds pure bar-social math (Phase 2 §2) — unit-tested
// without a DB. Iron rule: cheers only count between two REAL players who
// are both present right now; presence is verified server-side against the
// live connection hub, never trusted from the client.
package social

import "errors"

// ErrSelfCheers is returned when a player tries to cheers themselves.
var ErrSelfCheers = errors.New("cannot cheers with yourself")

// CheersRangeTiles is the max grid distance for a valid cheers.
const CheersRangeTiles = 2.5

// CanonicalPair orders two player ids so (A,B) and (B,A) hit the same
// CheersLog row (UNIQUE at the DB level).
func CanonicalPair(a, b string) (string, string, error) {
	if a == b {
		return "", "", ErrSelfCheers
	}
	if a < b {
		return a, b, nil
	}
	return b, a, nil
}

// WithinCheersRange reports whether two live positions are close enough.
func WithinCheersRange(x1, y1, x2, y2 float64) bool {
	dx := x1 - x2
	dy := y1 - y2
	return dx*dx+dy*dy <= CheersRangeTiles*CheersRangeTiles
}

// ReachedRegular reports whether this order made the player a regular —
// exactly at the threshold, per the brief ("ครบ 20 ครั้งพอดี").
func ReachedRegular(orderCount, threshold int) bool {
	return threshold > 0 && orderCount == threshold
}

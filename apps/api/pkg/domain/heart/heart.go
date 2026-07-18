// Package heart holds pure heart-system math (Phase 2 §6) — unit-tested
// without a DB. Iron rule f: every number here is only ever fed by
// server-side callers; nothing accepts client-claimed points.
package heart

// MaxLevel is the full reward track for the first character.
const MaxLevel = 10

// PointsForLevel returns cumulative points required to REACH level l
// (triangular curve: L1=30, L2=90, L3=180 … L10=1650).
func PointsForLevel(l int) int {
	if l <= 0 {
		return 0
	}
	return 15 * l * (l + 1)
}

// LevelForPoints converts cumulative points into a heart level (0..MaxLevel).
func LevelForPoints(points int) int {
	l := 0
	for l < MaxLevel && points >= PointsForLevel(l+1) {
		l++
	}
	return l
}

// Point values per action — order matters less than gifts by design
// (สั่งเมนูแนะนำ/ทิป น้อย, ของขวัญ เยอะสุด, คุยรายวัน กลางๆ, นั่งเฉยๆ ช้าสุด).
const (
	PointsSignatureOrder = 4
	PointsTip            = 3
	PointsDailyTalk      = 8
	PointsPresenceTick   = 1
)

// PointsForGift maps a gift preference to hearts. Gifts are the strongest
// source; a disliked gift still earns a polite single point.
func PointsForGift(preference string) int {
	switch preference {
	case "LOVED":
		return 25
	case "LIKED":
		return 12
	case "DISLIKED":
		return 1
	default: // NEUTRAL / unknown item
		return 5
	}
}

// OnShift reports whether hour h (server time) falls inside a shift that
// may wrap past midnight (e.g. 22→02).
func OnShift(startHour, endHour, h int) bool {
	if startHour == endHour {
		return false
	}
	if startHour < endHour {
		return h >= startHour && h < endHour
	}
	return h >= startHour || h < endHour
}

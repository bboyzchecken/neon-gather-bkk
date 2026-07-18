package heart

import "testing"

func TestLevelCurve(t *testing.T) {
	cases := []struct{ pts, want int }{
		{0, 0}, {29, 0}, {30, 1}, {89, 1}, {90, 2},
		{180, 3}, {1649, 9}, {1650, 10}, {999999, 10},
	}
	for _, c := range cases {
		if got := LevelForPoints(c.pts); got != c.want {
			t.Errorf("LevelForPoints(%d) = %d, want %d", c.pts, got, c.want)
		}
	}
	for l := 1; l <= MaxLevel; l++ {
		if LevelForPoints(PointsForLevel(l)) != l {
			t.Errorf("round trip failed at level %d", l)
		}
	}
}

func TestGiftsBeatEverythingElse(t *testing.T) {
	// design rule: gifts are the strongest single action
	if PointsForGift("LOVED") <= PointsDailyTalk ||
		PointsForGift("LOVED") <= PointsSignatureOrder ||
		PointsForGift("LOVED") <= PointsTip {
		t.Error("loved gifts must outscore every other single action")
	}
	if PointsForGift("DISLIKED") < 1 {
		t.Error("even a disliked gift earns a polite point")
	}
	if PointsForGift("???") != 5 {
		t.Error("unknown items are neutral")
	}
}

func TestOnShift(t *testing.T) {
	// plain evening shift 18→24
	if !OnShift(18, 24, 18) || !OnShift(18, 24, 23) {
		t.Error("18-24 shift must cover 18..23")
	}
	if OnShift(18, 24, 17) || OnShift(18, 24, 0) {
		t.Error("18-24 shift must exclude 17 and midnight")
	}
	// wrapping shift 22→02
	if !OnShift(22, 2, 23) || !OnShift(22, 2, 1) {
		t.Error("22-02 shift must cover 23 and 01")
	}
	if OnShift(22, 2, 12) {
		t.Error("22-02 shift must exclude noon")
	}
	if OnShift(5, 5, 5) {
		t.Error("zero-length shift is never on")
	}
}

package progression

import "testing"

func TestXPForLevel(t *testing.T) {
	cases := []struct{ level, want int }{
		{1, 0}, {2, 100}, {3, 300}, {4, 600}, {5, 1000}, {10, 4500},
	}
	for _, c := range cases {
		if got := XPForLevel(c.level); got != c.want {
			t.Errorf("XPForLevel(%d) = %d, want %d", c.level, got, c.want)
		}
	}
}

func TestLevelForXP(t *testing.T) {
	cases := []struct{ xp, want int }{
		{0, 1}, {99, 1}, {100, 2}, {299, 2}, {300, 3},
		{4499, 9}, {4500, 10}, {999999, 10}, // capped at MaxLevel
	}
	for _, c := range cases {
		if got := LevelForXP(c.xp); got != c.want {
			t.Errorf("LevelForXP(%d) = %d, want %d", c.xp, got, c.want)
		}
	}
}

func TestLevelXPRoundTrip(t *testing.T) {
	for l := 1; l <= MaxLevel; l++ {
		if got := LevelForXP(XPForLevel(l)); got != l {
			t.Errorf("LevelForXP(XPForLevel(%d)) = %d", l, got)
		}
	}
}

func TestAwardsForKnownEvents(t *testing.T) {
	for _, ev := range []string{
		"ITEM_CREATE", "VENDOR_SELL", "MARKET_SELL", "MARKET_BUY", "PLOT_RENT",
		"TABLE_ORDER", "TABLE_COLLECT", "TIP_RECEIVE", "SHIFT_HIRED",
		"VENDING_SOLD", "VENDING_BUY", "PHOTO_TAKEN",
	} {
		awards := AwardsFor(ev)
		if len(awards) == 0 {
			t.Errorf("AwardsFor(%s) is empty", ev)
		}
		for _, a := range awards {
			if a.XP <= 0 {
				t.Errorf("AwardsFor(%s) awards non-positive XP", ev)
			}
			if Tree(a.Job) == nil {
				t.Errorf("AwardsFor(%s) references unknown job %s", ev, a.Job)
			}
		}
	}
	if AwardsFor("NOT_AN_EVENT") != nil {
		t.Error("unknown events must award nothing")
	}
}

func TestTreeShape(t *testing.T) {
	for _, job := range Jobs() {
		perks := Tree(job)
		if len(perks) != 9 {
			t.Errorf("%s tree has %d perks, want 9 (3 branches × 3 tiers)", job, len(perks))
		}
		branches := map[string]int{}
		for _, p := range perks {
			branches[p.Branch]++
			if p.UnlockLevel < 2 || p.UnlockLevel > MaxLevel {
				t.Errorf("%s perk %s unlocks at invalid level %d", job, p.Code, p.UnlockLevel)
			}
		}
		if len(branches) != 3 {
			t.Errorf("%s has %d branches, want 3", job, len(branches))
		}
	}
}

func TestUnlockedPerksAndEffects(t *testing.T) {
	if n := len(UnlockedPerks("VENDOR", 1)); n != 0 {
		t.Errorf("level 1 should unlock nothing, got %d", n)
	}
	if n := len(UnlockedPerks("VENDOR", 2)); n != 3 {
		t.Errorf("level 2 should unlock one tier per branch, got %d", n)
	}
	if v := EffectValue("VENDOR", 1, "vendor_sale_bonus_bp"); v != 0 {
		t.Errorf("no bonus at level 1, got %d", v)
	}
	if v := EffectValue("VENDOR", 5, "vendor_sale_bonus_bp"); v != 1000 {
		t.Errorf("level 5 vendor bonus = %d, want 1000", v)
	}
	if v := EffectValue("VENDOR", 10, "vendor_sale_bonus_bp"); v != 1500 {
		t.Errorf("level 10 vendor bonus = %d, want 1500", v)
	}
}

func TestApplyBonusBP(t *testing.T) {
	if got := ApplyBonusBP(100, 0); got != 100 {
		t.Errorf("no bonus: got %d", got)
	}
	if got := ApplyBonusBP(100, 500); got != 105 {
		t.Errorf("5%% of 100: got %d, want 105", got)
	}
	if got := ApplyBonusBP(33, 1000); got != 36 { // 33 + 3.3 floored
		t.Errorf("10%% of 33: got %d, want 36", got)
	}
}

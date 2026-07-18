// Package progression holds pure job/XP/skill-tree math — unit-tested
// without a DB. All XP is computed server-side (iron rule §9).
package progression

// MaxLevel caps job levels for Phase 1.
const MaxLevel = 10

// XPForLevel returns the cumulative XP required to REACH level l
// (level 1 = 0 XP, level 2 = 100, level 3 = 300, level 4 = 600 …).
func XPForLevel(l int) int {
	if l <= 1 {
		return 0
	}
	return 50 * l * (l - 1)
}

// LevelForXP converts cumulative XP into a level (capped at MaxLevel).
func LevelForXP(xp int) int {
	l := 1
	for l < MaxLevel && xp >= XPForLevel(l+1) {
		l++
	}
	return l
}

// JobXP is one XP award for one job.
type JobXP struct {
	Job string
	XP  int
}

// AwardsFor maps a progress event to job XP awards. Events not listed award
// nothing (they may still advance quests).
func AwardsFor(event string) []JobXP {
	switch event {
	case "ITEM_CREATE":
		return []JobXP{{Job: "CRAFTER", XP: 12}}
	case "VENDOR_SELL":
		return []JobXP{{Job: "VENDOR", XP: 15}}
	case "MARKET_SELL":
		return []JobXP{{Job: "MERCHANT", XP: 20}}
	case "MARKET_BUY":
		return []JobXP{{Job: "MERCHANT", XP: 8}}
	case "PLOT_RENT":
		return []JobXP{{Job: "MERCHANT", XP: 40}}
	case "TABLE_ORDER":
		return []JobXP{{Job: "EXPLORER", XP: 5}}
	case "TABLE_COLLECT":
		return []JobXP{{Job: "HOST", XP: 15}}
	case "TIP_RECEIVE":
		return []JobXP{{Job: "HOST", XP: 25}}
	case "SHIFT_HIRED":
		return []JobXP{{Job: "HOST", XP: 30}}
	case "VENDING_SOLD":
		return []JobXP{{Job: "VENDOR", XP: 10}}
	case "VENDING_BUY":
		return []JobXP{{Job: "EXPLORER", XP: 6}}
	case "PHOTO_TAKEN":
		return []JobXP{{Job: "EXPLORER", XP: 18}}
	case "CHEERS":
		return []JobXP{{Job: "EXPLORER", XP: 5}}
	case "BAR_IDLE":
		return []JobXP{{Job: "EXPLORER", XP: 3}}
	case "GACHA_SPIN":
		return []JobXP{{Job: "EXPLORER", XP: 6}}
	default:
		return nil
	}
}

// Perk is one node of a job's skill tree. Perks unlock automatically when the
// job reaches UnlockLevel (Phase 1 keeps it light: no point spending).
type Perk struct {
	Code        string `json:"code"`
	Branch      string `json:"branch"`
	Name        string `json:"name"`
	Description string `json:"description"`
	UnlockLevel int    `json:"unlock_level"`
	// Effect is a machine-readable hook. Implemented in Phase 1:
	//   vendor_sale_bonus_bp — extra % (basis points) minted on vendor sells
	//   job_xp_bonus_bp      — extra % XP for this job
	// Other effects are declared for UI/flavour and wired in later phases.
	Effect string `json:"effect"`
	Value  int    `json:"value"`
}

// tree is the static Phase 1 skill tree: per job, 3 branches × 3 tiers
// unlocking at levels 2 / 5 / 8.
var tree = map[string][]Perk{
	"VENDOR": {
		{Code: "vendor_brew_1", Branch: "Barista", Name: "Steady Pour", Description: "+5% coins from vendor sales", UnlockLevel: 2, Effect: "vendor_sale_bonus_bp", Value: 500},
		{Code: "vendor_brew_2", Branch: "Barista", Name: "House Blend", Description: "+10% coins from vendor sales", UnlockLevel: 5, Effect: "vendor_sale_bonus_bp", Value: 1000},
		{Code: "vendor_brew_3", Branch: "Barista", Name: "Signature Menu", Description: "+15% coins from vendor sales", UnlockLevel: 8, Effect: "vendor_sale_bonus_bp", Value: 1500},
		{Code: "vendor_stock_1", Branch: "Stockmaster", Name: "Tidy Shelves", Description: "Vending restock up to 20 per slot", UnlockLevel: 2, Effect: "vending_stock_cap", Value: 20},
		{Code: "vendor_stock_2", Branch: "Stockmaster", Name: "Deep Storage", Description: "Vending restock up to 35 per slot", UnlockLevel: 5, Effect: "vending_stock_cap", Value: 35},
		{Code: "vendor_stock_3", Branch: "Stockmaster", Name: "Warehouse Mind", Description: "Vending restock up to 50 per slot", UnlockLevel: 8, Effect: "vending_stock_cap", Value: 50},
		{Code: "vendor_charm_1", Branch: "Regular Maker", Name: "Warm Welcome", Description: "+5% VENDOR XP", UnlockLevel: 2, Effect: "job_xp_bonus_bp", Value: 500},
		{Code: "vendor_charm_2", Branch: "Regular Maker", Name: "Remembered Orders", Description: "+10% VENDOR XP", UnlockLevel: 5, Effect: "job_xp_bonus_bp", Value: 1000},
		{Code: "vendor_charm_3", Branch: "Regular Maker", Name: "Neighbourhood Favourite", Description: "+15% VENDOR XP", UnlockLevel: 8, Effect: "job_xp_bonus_bp", Value: 1500},
	},
	"MERCHANT": {
		{Code: "merch_trade_1", Branch: "Trader", Name: "Keen Eye", Description: "+5% MERCHANT XP", UnlockLevel: 2, Effect: "job_xp_bonus_bp", Value: 500},
		{Code: "merch_trade_2", Branch: "Trader", Name: "Market Sense", Description: "+10% MERCHANT XP", UnlockLevel: 5, Effect: "job_xp_bonus_bp", Value: 1000},
		{Code: "merch_trade_3", Branch: "Trader", Name: "Avenue Broker", Description: "+15% MERCHANT XP", UnlockLevel: 8, Effect: "job_xp_bonus_bp", Value: 1500},
		{Code: "merch_prop_1", Branch: "Landlord", Name: "First Lease", Description: "Unlocks a plot banner cosmetic (Phase 3)", UnlockLevel: 2, Effect: "cosmetic", Value: 0},
		{Code: "merch_prop_2", Branch: "Landlord", Name: "Prime Location", Description: "Unlocks a facade trim cosmetic (Phase 3)", UnlockLevel: 5, Effect: "cosmetic", Value: 0},
		{Code: "merch_prop_3", Branch: "Landlord", Name: "Avenue Mogul", Description: "Unlocks a rooftop cosmetic (Phase 3)", UnlockLevel: 8, Effect: "cosmetic", Value: 0},
		{Code: "merch_ledger_1", Branch: "Bookkeeper", Name: "Neat Books", Description: "Ledger insights on the dashboard", UnlockLevel: 2, Effect: "ui_unlock", Value: 0},
		{Code: "merch_ledger_2", Branch: "Bookkeeper", Name: "Weekly Digest", Description: "Weekly earnings digest", UnlockLevel: 5, Effect: "ui_unlock", Value: 0},
		{Code: "merch_ledger_3", Branch: "Bookkeeper", Name: "Auditor", Description: "Full ledger history view", UnlockLevel: 8, Effect: "ui_unlock", Value: 0},
	},
	"CRAFTER": {
		{Code: "craft_make_1", Branch: "Maker", Name: "Steady Hands", Description: "+5% CRAFTER XP", UnlockLevel: 2, Effect: "job_xp_bonus_bp", Value: 500},
		{Code: "craft_make_2", Branch: "Maker", Name: "Workshop Flow", Description: "+10% CRAFTER XP", UnlockLevel: 5, Effect: "job_xp_bonus_bp", Value: 1000},
		{Code: "craft_make_3", Branch: "Maker", Name: "Master Maker", Description: "+15% CRAFTER XP", UnlockLevel: 8, Effect: "job_xp_bonus_bp", Value: 1500},
		{Code: "craft_style_1", Branch: "Designer", Name: "Eye for Colour", Description: "Unlocks item thumbnail frames (Phase 2)", UnlockLevel: 2, Effect: "cosmetic", Value: 0},
		{Code: "craft_style_2", Branch: "Designer", Name: "Display Sense", Description: "Unlocks display cabinet skins (Phase 2)", UnlockLevel: 5, Effect: "cosmetic", Value: 0},
		{Code: "craft_style_3", Branch: "Designer", Name: "Gallery Grade", Description: "Unlocks gallery frames (Phase 2)", UnlockLevel: 8, Effect: "cosmetic", Value: 0},
		{Code: "craft_gift_1", Branch: "Gifter", Name: "Thoughtful", Description: "Gift-wrap option (Phase 2 gifts)", UnlockLevel: 2, Effect: "cosmetic", Value: 0},
		{Code: "craft_gift_2", Branch: "Gifter", Name: "Wrapped with Care", Description: "Premium gift wrap (Phase 2 gifts)", UnlockLevel: 5, Effect: "cosmetic", Value: 0},
		{Code: "craft_gift_3", Branch: "Gifter", Name: "Legendary Bow", Description: "Legendary gift wrap (Phase 2 gifts)", UnlockLevel: 8, Effect: "cosmetic", Value: 0},
	},
	"HOST": {
		{Code: "host_serve_1", Branch: "Server", Name: "Quick Hands", Description: "+5% HOST XP", UnlockLevel: 2, Effect: "job_xp_bonus_bp", Value: 500},
		{Code: "host_serve_2", Branch: "Server", Name: "Floor Sense", Description: "+10% HOST XP", UnlockLevel: 5, Effect: "job_xp_bonus_bp", Value: 1000},
		{Code: "host_serve_3", Branch: "Server", Name: "Head of Floor", Description: "+15% HOST XP", UnlockLevel: 8, Effect: "job_xp_bonus_bp", Value: 1500},
		{Code: "host_tip_1", Branch: "Charmer", Name: "Friendly Face", Description: "Tip jar badge on nameplate", UnlockLevel: 2, Effect: "cosmetic", Value: 0},
		{Code: "host_tip_2", Branch: "Charmer", Name: "Regular Greeter", Description: "Sparkle serve effect", UnlockLevel: 5, Effect: "cosmetic", Value: 0},
		{Code: "host_tip_3", Branch: "Charmer", Name: "Beloved Staff", Description: "Golden tip jar badge", UnlockLevel: 8, Effect: "cosmetic", Value: 0},
		{Code: "host_shift_1", Branch: "Professional", Name: "Punctual", Description: "Job-board profile highlight", UnlockLevel: 2, Effect: "ui_unlock", Value: 0},
		{Code: "host_shift_2", Branch: "Professional", Name: "Trusted Hire", Description: "Priority listing on the job board", UnlockLevel: 5, Effect: "ui_unlock", Value: 0},
		{Code: "host_shift_3", Branch: "Professional", Name: "Avenue Veteran", Description: "Veteran badge on reviews", UnlockLevel: 8, Effect: "ui_unlock", Value: 0},
	},
	"EXPLORER": {
		{Code: "expl_photo_1", Branch: "Photographer", Name: "Good Angle", Description: "+5% EXPLORER XP", UnlockLevel: 2, Effect: "job_xp_bonus_bp", Value: 500},
		{Code: "expl_photo_2", Branch: "Photographer", Name: "Golden Hour", Description: "+10% EXPLORER XP", UnlockLevel: 5, Effect: "job_xp_bonus_bp", Value: 1000},
		{Code: "expl_photo_3", Branch: "Photographer", Name: "Avenue Lens", Description: "+15% EXPLORER XP", UnlockLevel: 8, Effect: "job_xp_bonus_bp", Value: 1500},
		{Code: "expl_taste_1", Branch: "Taster", Name: "Curious Palate", Description: "Tasting notes in the album (Phase 2 passport)", UnlockLevel: 2, Effect: "cosmetic", Value: 0},
		{Code: "expl_taste_2", Branch: "Taster", Name: "Menu Hunter", Description: "Tasting passport head start (Phase 2)", UnlockLevel: 5, Effect: "cosmetic", Value: 0},
		{Code: "expl_taste_3", Branch: "Taster", Name: "Avenue Gourmet", Description: "Gourmet badge (Phase 2)", UnlockLevel: 8, Effect: "cosmetic", Value: 0},
		{Code: "expl_walk_1", Branch: "Wanderer", Name: "Regular Route", Description: "Minimap pin cosmetic (Phase 3)", UnlockLevel: 2, Effect: "cosmetic", Value: 0},
		{Code: "expl_walk_2", Branch: "Wanderer", Name: "Every Corner", Description: "Floor-explorer badge (Phase 3)", UnlockLevel: 5, Effect: "cosmetic", Value: 0},
		{Code: "expl_walk_3", Branch: "Wanderer", Name: "Avenue Cartographer", Description: "Map cosmetic (Phase 3)", UnlockLevel: 8, Effect: "cosmetic", Value: 0},
	},
}

// Jobs lists the Phase 1 job types in display order.
func Jobs() []string {
	return []string{"VENDOR", "MERCHANT", "CRAFTER", "HOST", "EXPLORER"}
}

// Tree returns the full skill tree for a job (nil for unknown jobs).
func Tree(job string) []Perk { return tree[job] }

// UnlockedPerks returns every perk of a job unlocked at the given level.
func UnlockedPerks(job string, level int) []Perk {
	var out []Perk
	for _, p := range tree[job] {
		if level >= p.UnlockLevel {
			out = append(out, p)
		}
	}
	return out
}

// EffectValue returns the strongest unlocked value of one effect kind
// (e.g. the highest vendor_sale_bonus_bp reached), or 0 when none.
func EffectValue(job string, level int, effect string) int {
	best := 0
	for _, p := range UnlockedPerks(job, level) {
		if p.Effect == effect && p.Value > best {
			best = p.Value
		}
	}
	return best
}

// ApplyBonusBP adds a basis-point bonus to a base amount (rounding down).
func ApplyBonusBP(base, bp int) int {
	if bp <= 0 {
		return base
	}
	return base + (base*bp)/10000
}

package models

// Roles
const (
	RoleGuest  = "GUEST"
	RolePlayer = "PLAYER"
	RoleAdmin  = "ADMIN"
)

// Rarity tiers
const (
	RarityCommon    = "COMMON"
	RarityRare      = "RARE"
	RarityLegendary = "LEGENDARY"
)

// Item categories
const (
	CategoryDrink    = "DRINK"
	CategoryFood     = "FOOD"
	CategoryDecor    = "DECOR"
	CategoryMaterial = "MATERIAL"
	CategoryMisc     = "MISC"
)

// Plot status
const (
	PlotVacant = "VACANT"
	PlotRented = "RENTED"
)

// Facade templates (A/B/C from the asset library)
const (
	FacadeCafe       = "CAFE"
	FacadeVintage    = "VINTAGE"
	FacadeStreetfood = "STREETFOOD"
)

// Dining-table state machine
const (
	TableEmpty     = "EMPTY"
	TableOrdered   = "ORDERED"
	TableServed    = "SERVED"
	TableCollected = "COLLECTED"
)

// Content-moderation status (Phase 0 stub)
const (
	ModPendingReview = "PENDING_REVIEW"
	ModApproved      = "APPROVED"
	ModRejected      = "REJECTED"
)

// Ledger entry types
const (
	LedgerSignupBonus = "SIGNUP_BONUS"
	LedgerGuestBonus  = "GUEST_BONUS"
	LedgerVendorSell  = "VENDOR_SELL"
	LedgerMarketBuy   = "MARKET_BUY"
	LedgerMarketSell  = "MARKET_SELL"
	LedgerRentPay     = "RENT_PAY"
	LedgerAdminAdjust = "ADMIN_ADJUST"
	// Phase 1
	LedgerQuestReward = "QUEST_REWARD"
	LedgerTipPay      = "TIP_PAY"
	LedgerTipReceive  = "TIP_RECEIVE"
	LedgerWagePay     = "WAGE_PAY"
	LedgerWageReceive = "WAGE_RECEIVE"
	LedgerVendingBuy  = "VENDING_BUY"
	LedgerVendingSell = "VENDING_SELL"
)

// Player job types (Phase 1 — adapted to live systems, see DECISIONS.md D1.1)
const (
	JobVendor   = "VENDOR"
	JobMerchant = "MERCHANT"
	JobCrafter  = "CRAFTER"
	JobHost     = "HOST"
	JobExplorer = "EXPLORER"
)

// Quest types
const (
	QuestMain      = "MAIN"
	QuestJob       = "JOB"
	QuestDaily     = "DAILY"
	QuestWeekly    = "WEEKLY"
	QuestCommunity = "COMMUNITY"
)

// Player-quest status
const (
	PQActive    = "ACTIVE"
	PQCompleted = "COMPLETED"
	PQClaimed   = "CLAIMED"
)

// Job-board posting status
const (
	PostingOpen   = "OPEN"
	PostingClosed = "CLOSED"
)

// Employment status
const (
	EmploymentApplied = "APPLIED"
	EmploymentActive  = "ACTIVE"
	EmploymentEnded   = "ENDED"
)

// Photo types. 'HEART_SPECIAL' is reserved for the Phase 2 heart system
// (schema prepared now per the Phase 1 brief; not implemented yet).
const (
	PhotoBooth        = "BOOTH"
	PhotoHeartSpecial = "HEART_SPECIAL"
)

// Progress events — every server-side action that can award XP / advance
// quests. Fired ONLY from server code paths (iron rule §9: never trust the
// client for XP/progress).
const (
	EventItemCreate   = "ITEM_CREATE"
	EventVendorSell   = "VENDOR_SELL"
	EventMarketBuy    = "MARKET_BUY"
	EventMarketSell   = "MARKET_SELL"
	EventPlotRent     = "PLOT_RENT"
	EventTableOrder   = "TABLE_ORDER"
	EventTableCollect = "TABLE_COLLECT"
	EventTipReceive   = "TIP_RECEIVE"
	EventShiftHired   = "SHIFT_HIRED"
	EventVendingBuy   = "VENDING_BUY"
	EventVendingSold  = "VENDING_SOLD"
	EventPhotoTaken   = "PHOTO_TAKEN"
)

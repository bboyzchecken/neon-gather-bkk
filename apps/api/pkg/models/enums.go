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
)

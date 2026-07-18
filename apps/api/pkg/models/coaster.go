package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Coaster tiers (Phase 2 §1). REGULAR arrives with the regular-status system.
const (
	CoasterStandard     = "STANDARD"
	CoasterSeasonal     = "SEASONAL"
	CoasterRegular      = "REGULAR"
	CoasterOpeningNight = "OPENING_NIGHT"
)

// Coaster is one collectible design a shop issues. Bar-social iron rule: a
// coaster proves "you were THERE" — it is only ever granted by ordering at
// the shop, never purchasable directly.
// One row per (shop, tier, season) — enforced by a DB unique index.
type Coaster struct {
	ID        string    `gorm:"primaryKey;size:36" json:"id"`
	ShopID    string    `gorm:"size:36;not null;uniqueIndex:idx_shop_tier_season" json:"shop_id"` // plot id
	Shop      *Plot     `gorm:"foreignKey:ShopID" json:"shop,omitempty"`
	Tier      string    `gorm:"size:16;not null;uniqueIndex:idx_shop_tier_season" json:"tier"`
	Season    string    `gorm:"size:16;not null;uniqueIndex:idx_shop_tier_season" json:"season"`
	ImageURL  *string   `gorm:"size:512" json:"image_url"` // custom design (moderated upload); nil = template art
	Moderation *string  `gorm:"size:16" json:"moderation"`
	CreatedAt time.Time `json:"created_at"`
}

func (c *Coaster) BeforeCreate(_ *gorm.DB) error {
	if c.ID == "" {
		c.ID = uuid.NewString()
	}
	return nil
}

// PlayerCoaster is one player's owned copy. UNIQUE (player, coaster) at the
// DB level so a race can never grant duplicates (iron rule §10).
type PlayerCoaster struct {
	ID         string    `gorm:"primaryKey;size:36" json:"id"`
	PlayerID   string    `gorm:"size:36;not null;uniqueIndex:idx_player_coaster" json:"player_id"`
	Player     *User     `gorm:"foreignKey:PlayerID" json:"-"`
	CoasterID  string    `gorm:"size:36;not null;uniqueIndex:idx_player_coaster" json:"coaster_id"`
	Coaster    *Coaster  `gorm:"foreignKey:CoasterID" json:"coaster,omitempty"`
	ObtainedAt time.Time `json:"obtained_at"`
}

func (pc *PlayerCoaster) BeforeCreate(_ *gorm.DB) error {
	if pc.ID == "" {
		pc.ID = uuid.NewString()
	}
	if pc.ObtainedAt.IsZero() {
		pc.ObtainedAt = time.Now()
	}
	return nil
}

type CoasterStore interface {
	// EnsureCoaster returns the (shop, tier, season) coaster, creating it if
	// missing (races absorbed by the unique index).
	EnsureCoaster(tx *gorm.DB, shopID, tier, season string) (*Coaster, error)
	// Grant inserts a PlayerCoaster if the player doesn't own it yet.
	// Locks the coaster row and checks the per-shop season cap first.
	// Returns (granted, error).
	Grant(tx *gorm.DB, playerID, coasterID string, seasonCap int) (bool, error)
	ListByPlayer(playerID string) ([]PlayerCoaster, error)
	ListByShop(shopID string) ([]Coaster, error)
	FindCoaster(id string) (*Coaster, error)
	UpdateCoaster(c *Coaster) error
	// IssuedCount counts grants across a shop's coasters in one season.
	IssuedCount(tx *gorm.DB, shopID, season string) (int64, error)
}

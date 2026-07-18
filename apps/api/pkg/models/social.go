package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// RegularStatus counts one player's orders of one menu at one shop
// (Phase 2 §2). AchievedAt is set once, exactly when the count reaches the
// configured threshold — the title never downgrades.
type RegularStatus struct {
	ID         string     `gorm:"primaryKey;size:36" json:"id"`
	PlayerID   string     `gorm:"size:36;not null;uniqueIndex:idx_regular" json:"player_id"`
	Player     *User      `gorm:"foreignKey:PlayerID" json:"-"`
	ShopID     string     `gorm:"size:36;not null;uniqueIndex:idx_regular" json:"shop_id"`
	Shop       *Plot      `gorm:"foreignKey:ShopID" json:"shop,omitempty"`
	MenuName   string     `gorm:"size:64;not null;uniqueIndex:idx_regular" json:"menu_name"`
	OrderCount int        `gorm:"default:0" json:"order_count"`
	AchievedAt *time.Time `json:"achieved_at"`
	CreatedAt  time.Time  `json:"created_at"`
	UpdatedAt  time.Time  `json:"updated_at"`
}

func (r *RegularStatus) BeforeCreate(_ *gorm.DB) error {
	if r.ID == "" {
		r.ID = uuid.NewString()
	}
	return nil
}

// CheersLog records how often two REAL players clinked glasses. Player ids
// are stored in canonical order (a < b) under a DB UNIQUE index. Iron rule:
// rows are only written after the server verified both players are online
// and physically close in the live world — never on client claims, never
// with NPCs.
type CheersLog struct {
	ID            string    `gorm:"primaryKey;size:36" json:"id"`
	PlayerAID     string    `gorm:"size:36;not null;uniqueIndex:idx_cheers_pair" json:"player_a_id"`
	PlayerA       *User     `gorm:"foreignKey:PlayerAID" json:"-"`
	PlayerBID     string    `gorm:"size:36;not null;uniqueIndex:idx_cheers_pair" json:"player_b_id"`
	PlayerB       *User     `gorm:"foreignKey:PlayerBID" json:"-"`
	FirstCheersAt time.Time `json:"first_cheers_at"`
	TotalCount    int       `gorm:"default:0" json:"total_count"`
	UpdatedAt     time.Time `json:"updated_at"`
}

func (c *CheersLog) BeforeCreate(_ *gorm.DB) error {
	if c.ID == "" {
		c.ID = uuid.NewString()
	}
	if c.FirstCheersAt.IsZero() {
		c.FirstCheersAt = time.Now()
	}
	return nil
}

type SocialStore interface {
	// BumpRegular increments (player, shop, menu) inside tx and returns the
	// updated row (created on first order).
	BumpRegular(tx *gorm.DB, playerID, shopID, menuName string) (*RegularStatus, error)
	MarkRegularAchieved(tx *gorm.DB, id string) error
	ListRegularsByPlayer(playerID string) ([]RegularStatus, error)

	// BumpCheers increments the canonical pair inside tx and returns the row.
	BumpCheers(tx *gorm.DB, aID, bID string) (*CheersLog, error)
	ListCheersByPlayer(playerID string) ([]CheersLog, error)
}

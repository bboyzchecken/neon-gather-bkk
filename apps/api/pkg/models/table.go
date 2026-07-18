package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// DiningTable is a bar/cafe table with an order -> serve -> collect lifecycle.
// Serving is done by an AutoServeBot (deliberately NOT "NPC": Phase 2 adds a
// distinct StaffNPC concept that must not collide with this).
type DiningTable struct {
	ID        string     `gorm:"primaryKey;size:36" json:"id"`
	Code      string     `gorm:"uniqueIndex;size:16" json:"code"`
	PlotID    *string    `gorm:"size:36;index" json:"plot_id"`
	GridX     int        `json:"grid_x"`
	GridY     int        `json:"grid_y"`
	State     string     `gorm:"size:16;default:EMPTY" json:"state"`
	OrderName *string    `gorm:"size:64" json:"order_name"`
	OrderedAt *time.Time `json:"ordered_at"`
	ServedAt  *time.Time `json:"served_at"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
}

func (t *DiningTable) BeforeCreate(_ *gorm.DB) error {
	if t.ID == "" {
		t.ID = uuid.NewString()
	}
	return nil
}

type TableStore interface {
	List() ([]DiningTable, error)
	FindByID(id string) (*DiningTable, error)
	ListByState(state string) ([]DiningTable, error)
	Update(t *DiningTable) error
}

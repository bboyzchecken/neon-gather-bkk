package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// VendingMachine is a standalone 1×1-tile world object owned by a player
// (Phase 1). Buy flow: coins buyer→owner, stock decremented with a guarded
// UPDATE so two racers can't both win the last unit.
type VendingMachine struct {
	ID        string        `gorm:"primaryKey;size:36" json:"id"`
	Code      string        `gorm:"uniqueIndex;size:16" json:"code"`
	PlotID    *string       `gorm:"size:36;index" json:"plot_id"`
	OwnerID   string        `gorm:"size:36;not null;index" json:"owner_id"`
	Owner     *User         `gorm:"foreignKey:OwnerID" json:"owner,omitempty"`
	Floor     int           `gorm:"default:1;index" json:"floor"`
	GridX     int           `json:"grid_x"`
	GridY     int           `json:"grid_y"`
	Slots     []VendingSlot `gorm:"foreignKey:MachineID" json:"slots,omitempty"`
	CreatedAt time.Time     `json:"created_at"`
	UpdatedAt time.Time     `json:"updated_at"`
}

func (v *VendingMachine) BeforeCreate(_ *gorm.DB) error {
	if v.ID == "" {
		v.ID = uuid.NewString()
	}
	return nil
}

// VendingSlot is one product row in a machine. ItemName/Thumbnail/Category
// describe the product template; a fresh Item row is minted for the buyer on
// purchase (consistent with Phase 0's free-mint CreateItem).
type VendingSlot struct {
	ID           string    `gorm:"primaryKey;size:36" json:"id"`
	MachineID    string    `gorm:"size:36;not null;index" json:"machine_id"`
	ItemName     string    `gorm:"size:64;not null" json:"item_name"`
	Category     string    `gorm:"size:16;default:DRINK" json:"category"`
	ThumbnailURL *string   `gorm:"size:512" json:"thumbnail_url"`
	Price        int       `gorm:"not null" json:"price"`
	Stock        int       `gorm:"default:0" json:"stock"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

func (s *VendingSlot) BeforeCreate(_ *gorm.DB) error {
	if s.ID == "" {
		s.ID = uuid.NewString()
	}
	return nil
}

type VendingStore interface {
	List() ([]VendingMachine, error)
	FindByID(id string) (*VendingMachine, error)
	Create(m *VendingMachine) error
	CreateSlot(s *VendingSlot) error
	FindSlot(id string) (*VendingSlot, error)
	// ClaimStock atomically decrements stock only when still positive.
	ClaimStock(tx *gorm.DB, slotID string) (int64, error)
	// Restock adds stock up to cap, guarded in SQL. Returns rows affected.
	Restock(tx *gorm.DB, slotID string, add, cap int) (int64, error)
	ReloadSlot(tx *gorm.DB, id string) (*VendingSlot, error)
	UpdateSlot(s *VendingSlot) error
}

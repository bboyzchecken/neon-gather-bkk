package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Item struct {
	ID            string    `gorm:"primaryKey;size:36" json:"id"`
	Name          string    `gorm:"size:64;not null" json:"name"`
	Category      string    `gorm:"size:16" json:"category"`
	Price         int       `gorm:"default:0" json:"price"`
	ThumbnailURL  *string   `gorm:"size:512" json:"thumbnail_url"`
	Rarity        *string   `gorm:"size:16" json:"rarity"`
	OwnerID       string    `gorm:"size:36;index" json:"owner_id"`
	Owner         *User     `gorm:"foreignKey:OwnerID" json:"owner,omitempty"`
	ListedForSale bool      `gorm:"default:false;index" json:"listed_for_sale"`
	Metadata      *string   `gorm:"type:text" json:"-"` // reserved for later phases
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

func (i *Item) BeforeCreate(_ *gorm.DB) error {
	if i.ID == "" {
		i.ID = uuid.NewString()
	}
	return nil
}

type ItemStore interface {
	Create(it *Item) error
	FindByID(id string) (*Item, error)
	FindByOwner(ownerID string) ([]Item, error)
	ListForSale() ([]Item, error)
	Update(it *Item) error
	// DeleteOwned removes an item only if still owned by ownerID (guarded).
	DeleteOwned(tx *gorm.DB, id, ownerID string) (int64, error)
	// ClaimForSale transfers ownership only if still listed & owned by seller.
	ClaimForSale(tx *gorm.DB, id, sellerID, buyerID string) (int64, error)
	ReloadWithOwner(tx *gorm.DB, id string) (*Item, error)
}

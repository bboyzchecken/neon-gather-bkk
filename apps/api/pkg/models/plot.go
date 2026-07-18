package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Plot struct {
	ID               string     `gorm:"primaryKey;size:36" json:"id"`
	Code             string     `gorm:"uniqueIndex;size:16" json:"code"`
	GridX            int        `json:"grid_x"`
	GridY            int        `json:"grid_y"`
	WidthTiles       int        `gorm:"default:4" json:"width_tiles"`
	HeightTiles      int        `gorm:"default:4" json:"height_tiles"`
	Status           string     `gorm:"size:16;default:VACANT;index" json:"status"`
	RentPrice        int        `gorm:"default:200" json:"rent_price"`
	OwnerID          *string    `gorm:"size:36;index" json:"owner_id"`
	Owner            *User      `gorm:"foreignKey:OwnerID" json:"owner,omitempty"`
	FacadeTemplate   string     `gorm:"size:16;default:CAFE" json:"facade_template"`
	FacadeTextureURL *string    `gorm:"size:512" json:"facade_texture_url"`
	FacadeModeration *string    `gorm:"size:16" json:"facade_moderation"`
	RentedAt         *time.Time `json:"rented_at"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
}

func (p *Plot) BeforeCreate(_ *gorm.DB) error {
	if p.ID == "" {
		p.ID = uuid.NewString()
	}
	return nil
}

type PlotStore interface {
	List() ([]Plot, error)
	FindByID(id string) (*Plot, error)
	// ClaimVacant atomically flips a plot to RENTED only if still VACANT.
	ClaimVacant(tx *gorm.DB, id, ownerID string) (int64, error)
	Reload(tx *gorm.DB, id string) (*Plot, error)
	Update(p *Plot) error
}

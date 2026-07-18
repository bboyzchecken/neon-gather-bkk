package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Photo is a photo-booth capture stored in object storage. PhotoType is
// BOOTH today; HEART_SPECIAL is reserved for the Phase 2 heart system
// (the Phase 1 brief asks for the schema headroom now, no implementation).
type Photo struct {
	ID         string    `gorm:"primaryKey;size:36" json:"id"`
	UserID     string    `gorm:"size:36;not null;index" json:"user_id"`
	User       *User     `gorm:"foreignKey:UserID" json:"-"`
	URL        string    `gorm:"size:512;not null" json:"url"`
	PhotoType  string    `gorm:"size:16;default:BOOTH;index" json:"photo_type"`
	Background string    `gorm:"size:32" json:"background"`
	Caption    string    `gorm:"size:120" json:"caption"`
	ShareToken string    `gorm:"uniqueIndex;size:36;not null" json:"share_token"`
	Moderation string    `gorm:"size:16;default:PENDING_REVIEW" json:"moderation"`
	CreatedAt  time.Time `json:"created_at"`
}

func (p *Photo) BeforeCreate(_ *gorm.DB) error {
	if p.ID == "" {
		p.ID = uuid.NewString()
	}
	if p.ShareToken == "" {
		p.ShareToken = uuid.NewString()
	}
	return nil
}

type PhotoStore interface {
	Create(p *Photo) error
	FindByID(id string) (*Photo, error)
	FindByShareToken(token string) (*Photo, error)
	ListByUser(userID string) ([]Photo, error)
	// DeleteOwned removes a photo only if owned by userID (guarded).
	DeleteOwned(id, userID string) (int64, error)
}

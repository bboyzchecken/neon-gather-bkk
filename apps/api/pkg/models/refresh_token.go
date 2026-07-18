package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type RefreshToken struct {
	ID        string    `gorm:"primaryKey;size:36" json:"id"`
	UserID    string    `gorm:"size:36;index" json:"user_id"`
	TokenHash string    `gorm:"uniqueIndex;size:64" json:"-"`
	ExpiresAt time.Time `json:"expires_at"`
	Revoked   bool      `gorm:"default:false" json:"revoked"`
	CreatedAt time.Time `json:"created_at"`
}

func (r *RefreshToken) BeforeCreate(_ *gorm.DB) error {
	if r.ID == "" {
		r.ID = uuid.NewString()
	}
	return nil
}

type RefreshTokenStore interface {
	Create(rt *RefreshToken) error
	FindByHash(hash string) (*RefreshToken, error)
	Update(rt *RefreshToken) error
	RevokeByHashUser(hash, userID string) error
}

package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type User struct {
	ID          string    `gorm:"primaryKey;size:36" json:"id"`
	Email       *string   `gorm:"uniqueIndex;size:255" json:"email"`
	Password    string    `gorm:"size:255" json:"-"`
	DisplayName string    `gorm:"size:64;not null" json:"display_name"`
	Role        string    `gorm:"size:16;default:PLAYER" json:"role"`
	IsGuest     bool      `gorm:"default:false" json:"is_guest"`
	Coins       int       `gorm:"default:0" json:"coins"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

func (u *User) BeforeCreate(_ *gorm.DB) error {
	if u.ID == "" {
		u.ID = uuid.NewString()
	}
	return nil
}

type UserStore interface {
	Create(user *User) error
	FindByID(id string) (*User, error)
	FindByEmail(email string) (*User, error)
	Update(user *User) error
}

package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// LedgerEntry is an append-only record of every coin movement so balances
// stay auditable and money can never silently vanish (iron rule §9).
type LedgerEntry struct {
	ID           string    `gorm:"primaryKey;size:36" json:"id"`
	UserID       string    `gorm:"size:36;index" json:"user_id"`
	Amount       int       `json:"amount"` // positive = credit, negative = debit
	Type         string    `gorm:"size:24" json:"type"`
	BalanceAfter int       `json:"balance_after"`
	RefID        *string   `gorm:"size:64" json:"ref_id"`
	Note         *string   `gorm:"size:255" json:"note"`
	CreatedAt    time.Time `json:"created_at"`
}

func (l *LedgerEntry) BeforeCreate(_ *gorm.DB) error {
	if l.ID == "" {
		l.ID = uuid.NewString()
	}
	return nil
}

// WalletStore centralises all coin mutations behind a ledger write.
type WalletStore interface {
	// ApplyDelta mutates a user's balance inside an existing transaction and
	// writes one ledger row. Refuses to overdraw.
	ApplyDelta(tx *gorm.DB, userID string, delta int, ltype, refID, note string) (int, error)
	// Credit / Debit run a single delta in their own transaction.
	Credit(userID, ltype string, amount int, note string) (int, error)
	Debit(userID, ltype string, amount int, note string) (int, error)
}

package wallet

import (
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	dwallet "neongather/pkg/domain/wallet"
	"neongather/pkg/models"
)

type store struct{ db *gorm.DB }

func New(db *gorm.DB) models.WalletStore { return &store{db: db} }

// ApplyDelta mutates a balance inside an existing transaction and writes one
// ledger row. The balance row is locked FOR UPDATE to prevent double-spend.
func (s *store) ApplyDelta(tx *gorm.DB, userID string, delta int, ltype, refID, note string) (int, error) {
	var u models.User
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		First(&u, "id = ?", userID).Error; err != nil {
		return 0, err
	}
	next, err := dwallet.NextBalance(u.Coins, delta)
	if err != nil {
		return 0, err
	}
	if err := tx.Model(&models.User{}).Where("id = ?", userID).
		Update("coins", next).Error; err != nil {
		return 0, err
	}
	entry := &models.LedgerEntry{UserID: userID, Amount: delta, Type: ltype, BalanceAfter: next}
	if refID != "" {
		entry.RefID = &refID
	}
	if note != "" {
		entry.Note = &note
	}
	if err := tx.Create(entry).Error; err != nil {
		return 0, err
	}
	return next, nil
}

func (s *store) Credit(userID, ltype string, amount int, note string) (int, error) {
	return s.single(userID, ltype, abs(amount), note)
}

func (s *store) Debit(userID, ltype string, amount int, note string) (int, error) {
	return s.single(userID, ltype, -abs(amount), note)
}

func (s *store) single(userID, ltype string, delta int, note string) (int, error) {
	var bal int
	err := s.db.Transaction(func(tx *gorm.DB) error {
		b, e := s.ApplyDelta(tx, userID, delta, ltype, "", note)
		bal = b
		return e
	})
	return bal, err
}

func abs(n int) int {
	if n < 0 {
		return -n
	}
	return n
}

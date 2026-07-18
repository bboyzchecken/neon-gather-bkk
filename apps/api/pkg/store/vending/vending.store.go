package vending

import (
	"gorm.io/gorm"

	"neongather/pkg/models"
)

type store struct{ db *gorm.DB }

func New(db *gorm.DB) models.VendingStore { return &store{db: db} }

func (s *store) List() ([]models.VendingMachine, error) {
	var ms []models.VendingMachine
	err := s.db.Preload("Slots").Preload("Owner").Order("code").Find(&ms).Error
	return ms, err
}

func (s *store) FindByID(id string) (*models.VendingMachine, error) {
	var m models.VendingMachine
	if err := s.db.Preload("Slots").Preload("Owner").First(&m, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &m, nil
}

func (s *store) Create(m *models.VendingMachine) error { return s.db.Create(m).Error }

func (s *store) CreateSlot(slot *models.VendingSlot) error { return s.db.Create(slot).Error }

func (s *store) FindSlot(id string) (*models.VendingSlot, error) {
	var slot models.VendingSlot
	if err := s.db.First(&slot, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &slot, nil
}

// ClaimStock decrements stock only while positive — the guarded UPDATE makes
// the "last unit" race safe at the DB level.
func (s *store) ClaimStock(tx *gorm.DB, slotID string) (int64, error) {
	res := tx.Model(&models.VendingSlot{}).
		Where("id = ? AND stock > 0", slotID).
		Update("stock", gorm.Expr("stock - 1"))
	return res.RowsAffected, res.Error
}

// Restock adds stock but never beyond cap, enforced in the UPDATE itself.
func (s *store) Restock(tx *gorm.DB, slotID string, add, cap int) (int64, error) {
	res := tx.Model(&models.VendingSlot{}).
		Where("id = ? AND stock + ? <= ?", slotID, add, cap).
		Update("stock", gorm.Expr("stock + ?", add))
	return res.RowsAffected, res.Error
}

func (s *store) ReloadSlot(tx *gorm.DB, id string) (*models.VendingSlot, error) {
	var slot models.VendingSlot
	if err := tx.First(&slot, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &slot, nil
}

func (s *store) UpdateSlot(slot *models.VendingSlot) error { return s.db.Save(slot).Error }

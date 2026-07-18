package item

import (
	"gorm.io/gorm"
	"neongather/pkg/models"
)

type store struct{ db *gorm.DB }

func New(db *gorm.DB) models.ItemStore { return &store{db: db} }

func (s *store) Create(it *models.Item) error { return s.db.Create(it).Error }

func (s *store) FindByID(id string) (*models.Item, error) {
	var it models.Item
	if err := s.db.First(&it, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &it, nil
}

func (s *store) FindByOwner(ownerID string) ([]models.Item, error) {
	var items []models.Item
	err := s.db.Preload("Owner").
		Where("owner_id = ?", ownerID).
		Order("created_at desc").Find(&items).Error
	return items, err
}

func (s *store) ListForSale() ([]models.Item, error) {
	var items []models.Item
	err := s.db.Preload("Owner").
		Where("listed_for_sale = ?", true).
		Order("updated_at desc").Find(&items).Error
	return items, err
}

func (s *store) Update(it *models.Item) error { return s.db.Save(it).Error }

func (s *store) DeleteOwned(tx *gorm.DB, id, ownerID string) (int64, error) {
	res := tx.Where("id = ? AND owner_id = ?", id, ownerID).Delete(&models.Item{})
	return res.RowsAffected, res.Error
}

func (s *store) ClaimForSale(tx *gorm.DB, id, sellerID, buyerID string) (int64, error) {
	res := tx.Model(&models.Item{}).
		Where("id = ? AND owner_id = ? AND listed_for_sale = ?", id, sellerID, true).
		Updates(map[string]any{"owner_id": buyerID, "listed_for_sale": false})
	return res.RowsAffected, res.Error
}

func (s *store) ReloadWithOwner(tx *gorm.DB, id string) (*models.Item, error) {
	var it models.Item
	if err := tx.Preload("Owner").First(&it, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &it, nil
}

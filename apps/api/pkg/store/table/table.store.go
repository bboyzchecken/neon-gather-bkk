package table

import (
	"gorm.io/gorm"
	"neongather/pkg/models"
)

type store struct{ db *gorm.DB }

func New(db *gorm.DB) models.TableStore { return &store{db: db} }

func (s *store) List() ([]models.DiningTable, error) {
	var ts []models.DiningTable
	err := s.db.Order("code asc").Find(&ts).Error
	return ts, err
}

func (s *store) FindByID(id string) (*models.DiningTable, error) {
	var t models.DiningTable
	if err := s.db.First(&t, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &t, nil
}

func (s *store) ListByState(state string) ([]models.DiningTable, error) {
	var ts []models.DiningTable
	err := s.db.Where("state = ?", state).Find(&ts).Error
	return ts, err
}

func (s *store) Update(t *models.DiningTable) error { return s.db.Save(t).Error }

package plot

import (
	"time"

	"gorm.io/gorm"
	"neongather/pkg/models"
)

type store struct{ db *gorm.DB }

func New(db *gorm.DB) models.PlotStore { return &store{db: db} }

func (s *store) List() ([]models.Plot, error) {
	var ps []models.Plot
	err := s.db.Preload("Owner").Order("grid_y asc, grid_x asc").Find(&ps).Error
	return ps, err
}

func (s *store) FindByID(id string) (*models.Plot, error) {
	var p models.Plot
	if err := s.db.First(&p, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &p, nil
}

func (s *store) ClaimVacant(tx *gorm.DB, id, ownerID string) (int64, error) {
	res := tx.Model(&models.Plot{}).
		Where("id = ? AND status = ?", id, models.PlotVacant).
		Updates(map[string]any{
			"status":    models.PlotRented,
			"owner_id":  ownerID,
			"rented_at": time.Now(),
		})
	return res.RowsAffected, res.Error
}

func (s *store) Reload(tx *gorm.DB, id string) (*models.Plot, error) {
	var p models.Plot
	if err := tx.Preload("Owner").First(&p, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &p, nil
}

func (s *store) Update(p *models.Plot) error { return s.db.Save(p).Error }

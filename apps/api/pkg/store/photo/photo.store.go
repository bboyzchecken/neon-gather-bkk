package photo

import (
	"gorm.io/gorm"

	"neongather/pkg/models"
)

type store struct{ db *gorm.DB }

func New(db *gorm.DB) models.PhotoStore { return &store{db: db} }

func (s *store) Create(p *models.Photo) error { return s.db.Create(p).Error }

func (s *store) FindByID(id string) (*models.Photo, error) {
	var p models.Photo
	if err := s.db.First(&p, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &p, nil
}

func (s *store) FindByShareToken(token string) (*models.Photo, error) {
	var p models.Photo
	if err := s.db.Preload("User").First(&p, "share_token = ?", token).Error; err != nil {
		return nil, err
	}
	return &p, nil
}

func (s *store) ListByUser(userID string) ([]models.Photo, error) {
	var ps []models.Photo
	err := s.db.Where("user_id = ?", userID).Order("created_at desc").Find(&ps).Error
	return ps, err
}

func (s *store) DeleteOwned(id, userID string) (int64, error) {
	res := s.db.Where("id = ? AND user_id = ?", id, userID).Delete(&models.Photo{})
	return res.RowsAffected, res.Error
}

package token

import (
	"gorm.io/gorm"
	"neongather/pkg/models"
)

type store struct{ db *gorm.DB }

func New(db *gorm.DB) models.RefreshTokenStore { return &store{db: db} }

func (s *store) Create(rt *models.RefreshToken) error { return s.db.Create(rt).Error }

func (s *store) FindByHash(hash string) (*models.RefreshToken, error) {
	var rt models.RefreshToken
	if err := s.db.First(&rt, "token_hash = ?", hash).Error; err != nil {
		return nil, err
	}
	return &rt, nil
}

func (s *store) Update(rt *models.RefreshToken) error { return s.db.Save(rt).Error }

func (s *store) RevokeByHashUser(hash, userID string) error {
	return s.db.Model(&models.RefreshToken{}).
		Where("token_hash = ? AND user_id = ?", hash, userID).
		Update("revoked", true).Error
}

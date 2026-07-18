package user

import (
	"gorm.io/gorm"
	"neongather/pkg/models"
)

type store struct{ db *gorm.DB }

func New(db *gorm.DB) models.UserStore { return &store{db: db} }

func (s *store) Create(u *models.User) error { return s.db.Create(u).Error }

func (s *store) FindByID(id string) (*models.User, error) {
	var u models.User
	if err := s.db.First(&u, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &u, nil
}

func (s *store) FindByEmail(email string) (*models.User, error) {
	var u models.User
	if err := s.db.First(&u, "email = ?", email).Error; err != nil {
		return nil, err
	}
	return &u, nil
}

func (s *store) Update(u *models.User) error { return s.db.Save(u).Error }

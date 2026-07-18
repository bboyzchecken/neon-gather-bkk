package staff

import (
	"gorm.io/gorm"

	"neongather/pkg/models"
)

type store struct{ db *gorm.DB }

func New(db *gorm.DB) models.StaffStore { return &store{db: db} }

func (s *store) CreatePosting(p *models.JobPosting) error { return s.db.Create(p).Error }

func (s *store) FindPosting(id string) (*models.JobPosting, error) {
	var p models.JobPosting
	if err := s.db.Preload("Plot").Preload("Owner").First(&p, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &p, nil
}

func (s *store) ListOpenPostings() ([]models.JobPosting, error) {
	var ps []models.JobPosting
	err := s.db.Preload("Plot").Preload("Owner").
		Where("status = ?", models.PostingOpen).
		Order("created_at desc").Find(&ps).Error
	return ps, err
}

func (s *store) ListPostingsByOwner(ownerID string) ([]models.JobPosting, error) {
	var ps []models.JobPosting
	err := s.db.Preload("Plot").
		Where("owner_id = ?", ownerID).
		Order("created_at desc").Find(&ps).Error
	return ps, err
}

func (s *store) UpdatePosting(p *models.JobPosting) error { return s.db.Save(p).Error }

func (s *store) CreateEmployment(e *models.Employment) error { return s.db.Create(e).Error }

func (s *store) FindEmployment(id string) (*models.Employment, error) {
	var e models.Employment
	if err := s.db.Preload("Posting").Preload("Staff").First(&e, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &e, nil
}

func (s *store) ListEmploymentsByPosting(postingID string) ([]models.Employment, error) {
	var es []models.Employment
	err := s.db.Preload("Staff").
		Where("posting_id = ?", postingID).
		Order("created_at").Find(&es).Error
	return es, err
}

func (s *store) ListEmploymentsByStaff(staffID string) ([]models.Employment, error) {
	var es []models.Employment
	err := s.db.Preload("Posting").Preload("Posting.Plot").
		Where("staff_id = ?", staffID).
		Order("created_at desc").Find(&es).Error
	return es, err
}

func (s *store) ActiveStaffForPlot(plotID string) ([]models.Employment, error) {
	var es []models.Employment
	err := s.db.Where("plot_id = ? AND status = ?", plotID, models.EmploymentActive).Find(&es).Error
	return es, err
}

func (s *store) UpdateEmployment(e *models.Employment) error { return s.db.Save(e).Error }

func (s *store) CreateReview(r *models.StaffReview) error { return s.db.Create(r).Error }

func (s *store) ListReviewsForStaff(staffID string) ([]models.StaffReview, error) {
	var rs []models.StaffReview
	err := s.db.Preload("Rater").
		Where("staff_id = ?", staffID).
		Order("created_at desc").Find(&rs).Error
	return rs, err
}

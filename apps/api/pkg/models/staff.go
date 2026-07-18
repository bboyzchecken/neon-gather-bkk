package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// JobPosting is a shop owner's open staff position (Phase 1 job board).
// Player↔player relations are LIMITED to tips / reviews / ratings — no heart
// points or any accumulating affection system may ever attach to real players
// (iron rule; the Phase 2 heart system binds to StaffNPC only).
type JobPosting struct {
	ID           string    `gorm:"primaryKey;size:36" json:"id"`
	PlotID       string    `gorm:"size:36;not null;index" json:"plot_id"`
	Plot         *Plot     `gorm:"foreignKey:PlotID" json:"plot,omitempty"`
	OwnerID      string    `gorm:"size:36;not null;index" json:"owner_id"`
	Owner        *User     `gorm:"foreignKey:OwnerID" json:"owner,omitempty"`
	Title        string    `gorm:"size:96;not null" json:"title"`
	Description  string    `gorm:"size:255" json:"description"`
	WagePerTask  int       `gorm:"default:5" json:"wage_per_task"` // coins per table collected on the plot
	Status       string    `gorm:"size:12;default:OPEN;index" json:"status"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

func (p *JobPosting) BeforeCreate(_ *gorm.DB) error {
	if p.ID == "" {
		p.ID = uuid.NewString()
	}
	return nil
}

// Employment links a staff player to a posting. One row per (posting, staff)
// — DB-level unique so double-applies can't race.
type Employment struct {
	ID        string     `gorm:"primaryKey;size:36" json:"id"`
	PostingID string     `gorm:"size:36;not null;uniqueIndex:idx_posting_staff" json:"posting_id"`
	Posting   *JobPosting `gorm:"foreignKey:PostingID" json:"posting,omitempty"`
	PlotID    string     `gorm:"size:36;not null;index" json:"plot_id"`
	OwnerID   string     `gorm:"size:36;not null;index" json:"owner_id"`
	StaffID   string     `gorm:"size:36;not null;uniqueIndex:idx_posting_staff" json:"staff_id"`
	Staff     *User      `gorm:"foreignKey:StaffID" json:"staff,omitempty"`
	Status    string     `gorm:"size:12;default:APPLIED;index" json:"status"`
	AppliedAt time.Time  `json:"applied_at"`
	HiredAt   *time.Time `json:"hired_at"`
	EndedAt   *time.Time `json:"ended_at"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
}

func (e *Employment) BeforeCreate(_ *gorm.DB) error {
	if e.ID == "" {
		e.ID = uuid.NewString()
	}
	if e.AppliedAt.IsZero() {
		e.AppliedAt = time.Now()
	}
	return nil
}

// StaffReview is a 1-5 star rating + comment on an employment. One review per
// rater per employment (DB unique).
type StaffReview struct {
	ID           string      `gorm:"primaryKey;size:36" json:"id"`
	EmploymentID string      `gorm:"size:36;not null;uniqueIndex:idx_employment_rater" json:"employment_id"`
	Employment   *Employment `gorm:"foreignKey:EmploymentID" json:"-"`
	RaterID      string      `gorm:"size:36;not null;uniqueIndex:idx_employment_rater" json:"rater_id"`
	Rater        *User       `gorm:"foreignKey:RaterID" json:"rater,omitempty"`
	StaffID      string      `gorm:"size:36;not null;index" json:"staff_id"`
	Stars        int         `gorm:"not null" json:"stars"`
	Comment      string      `gorm:"size:255" json:"comment"`
	CreatedAt    time.Time   `json:"created_at"`
}

func (r *StaffReview) BeforeCreate(_ *gorm.DB) error {
	if r.ID == "" {
		r.ID = uuid.NewString()
	}
	return nil
}

type StaffStore interface {
	CreatePosting(p *JobPosting) error
	FindPosting(id string) (*JobPosting, error)
	ListOpenPostings() ([]JobPosting, error)
	ListPostingsByOwner(ownerID string) ([]JobPosting, error)
	UpdatePosting(p *JobPosting) error

	CreateEmployment(e *Employment) error
	FindEmployment(id string) (*Employment, error)
	ListEmploymentsByPosting(postingID string) ([]Employment, error)
	ListEmploymentsByStaff(staffID string) ([]Employment, error)
	// ActiveStaffForPlot returns staff ids employed ACTIVE on a plot (for
	// order notifications).
	ActiveStaffForPlot(plotID string) ([]Employment, error)
	UpdateEmployment(e *Employment) error

	CreateReview(r *StaffReview) error
	ListReviewsForStaff(staffID string) ([]StaffReview, error)
}

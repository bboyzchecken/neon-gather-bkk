package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// PlayerJob tracks one player's progress in one job (Phase 1 job system).
// XP and level are only ever computed server-side (iron rule §9).
type PlayerJob struct {
	ID        string    `gorm:"primaryKey;size:36" json:"id"`
	PlayerID  string    `gorm:"size:36;not null;uniqueIndex:idx_player_job" json:"player_id"`
	Player    *User     `gorm:"foreignKey:PlayerID" json:"-"`
	JobType   string    `gorm:"size:16;not null;uniqueIndex:idx_player_job" json:"job_type"`
	XP        int       `gorm:"default:0" json:"xp"`
	Level     int       `gorm:"default:1" json:"level"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (j *PlayerJob) BeforeCreate(_ *gorm.DB) error {
	if j.ID == "" {
		j.ID = uuid.NewString()
	}
	return nil
}

type JobStore interface {
	// AddXP upserts the (player, job) row inside tx, adds xp and recomputes
	// the level. Returns the updated row and whether a level-up happened.
	AddXP(tx *gorm.DB, playerID, jobType string, xp int) (*PlayerJob, bool, error)
	ListByPlayer(playerID string) ([]PlayerJob, error)
	Find(playerID, jobType string) (*PlayerJob, error)
}

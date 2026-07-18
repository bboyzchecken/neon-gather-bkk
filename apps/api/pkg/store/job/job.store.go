package job

import (
	"errors"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"neongather/pkg/domain/progression"
	"neongather/pkg/models"
)

type store struct{ db *gorm.DB }

func New(db *gorm.DB) models.JobStore { return &store{db: db} }

// AddXP upserts the (player, job) row, locks it, adds xp and recomputes the
// level from the progression curve. XP only ever flows through here.
func (s *store) AddXP(tx *gorm.DB, playerID, jobType string, xp int) (*models.PlayerJob, bool, error) {
	var row models.PlayerJob
	err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		First(&row, "player_id = ? AND job_type = ?", playerID, jobType).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		row = models.PlayerJob{PlayerID: playerID, JobType: jobType, XP: 0, Level: 1}
		if err := tx.Create(&row).Error; err != nil {
			return nil, false, err
		}
	} else if err != nil {
		return nil, false, err
	}

	before := row.Level
	row.XP += xp
	row.Level = progression.LevelForXP(row.XP)
	if err := tx.Model(&models.PlayerJob{}).Where("id = ?", row.ID).
		Updates(map[string]any{"xp": row.XP, "level": row.Level}).Error; err != nil {
		return nil, false, err
	}
	return &row, row.Level > before, nil
}

func (s *store) ListByPlayer(playerID string) ([]models.PlayerJob, error) {
	var rows []models.PlayerJob
	err := s.db.Where("player_id = ?", playerID).Order("job_type").Find(&rows).Error
	return rows, err
}

func (s *store) Find(playerID, jobType string) (*models.PlayerJob, error) {
	var row models.PlayerJob
	if err := s.db.First(&row, "player_id = ? AND job_type = ?", playerID, jobType).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

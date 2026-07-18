package heart

import (
	"errors"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	dheart "neongather/pkg/domain/heart"
	"neongather/pkg/models"
)

type store struct{ db *gorm.DB }

func New(db *gorm.DB) models.HeartStore { return &store{db: db} }

func (s *store) ListActiveNPCs() ([]models.StaffNPC, error) {
	var rows []models.StaffNPC
	err := s.db.Preload("HomeShop").Where("is_active = ?", true).Order("name").Find(&rows).Error
	return rows, err
}

func (s *store) FindNPC(id string) (*models.StaffNPC, error) {
	var n models.StaffNPC
	if err := s.db.Preload("HomeShop").First(&n, "id = ? AND is_active = ?", id, true).Error; err != nil {
		return nil, err
	}
	return &n, nil
}

func (s *store) ListGiftPrefs(staffID string) ([]models.StaffGiftPref, error) {
	var rows []models.StaffGiftPref
	err := s.db.Where("staff_id = ?", staffID).Order("item_name").Find(&rows).Error
	return rows, err
}

func (s *store) ListStoryNodes(staffID string) ([]models.StaffStoryNode, error) {
	var rows []models.StaffStoryNode
	err := s.db.Where("staff_id = ?", staffID).Order("required_level").Find(&rows).Error
	return rows, err
}

// AddHearts upserts the affinity, locks it, adds server-computed points and
// recomputes the level. Points NEVER arrive from the client (iron rule f);
// the StaffID FK physically cannot reference a real player (iron rule a).
func (s *store) AddHearts(tx *gorm.DB, playerID, staffID string, points int) (*models.PlayerAffinity, bool, error) {
	var row models.PlayerAffinity
	err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		First(&row, "player_id = ? AND staff_id = ?", playerID, staffID).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		row = models.PlayerAffinity{PlayerID: playerID, StaffID: staffID}
		if cerr := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&row).Error; cerr != nil {
			return nil, false, cerr
		}
		if rerr := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			First(&row, "player_id = ? AND staff_id = ?", playerID, staffID).Error; rerr != nil {
			return nil, false, rerr
		}
	} else if err != nil {
		return nil, false, err
	}
	before := row.HeartLevel
	row.HeartPoints += points
	row.HeartLevel = dheart.LevelForPoints(row.HeartPoints)
	if err := tx.Model(&models.PlayerAffinity{}).Where("id = ?", row.ID).
		Updates(map[string]any{"heart_points": row.HeartPoints, "heart_level": row.HeartLevel}).Error; err != nil {
		return nil, false, err
	}
	return &row, row.HeartLevel > before, nil
}

func (s *store) FindAffinity(playerID, staffID string) (*models.PlayerAffinity, error) {
	var row models.PlayerAffinity
	if err := s.db.First(&row, "player_id = ? AND staff_id = ?", playerID, staffID).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

func (s *store) ListAffinities(playerID string) ([]models.PlayerAffinity, error) {
	var rows []models.PlayerAffinity
	err := s.db.Preload("Staff").Where("player_id = ?", playerID).Find(&rows).Error
	return rows, err
}

// TouchTalked flips last_talked_at to now, guarded in SQL to once per
// server-local day — the guard lives in the database, not the client.
func (s *store) TouchTalked(tx *gorm.DB, affinityID string, now time.Time) (int64, error) {
	dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	res := tx.Model(&models.PlayerAffinity{}).
		Where("id = ? AND (last_talked_at IS NULL OR last_talked_at < ?)", affinityID, dayStart).
		Update("last_talked_at", now)
	return res.RowsAffected, res.Error
}

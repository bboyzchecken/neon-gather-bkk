package quest

import (
	"errors"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"neongather/pkg/models"
)

type store struct{ db *gorm.DB }

func New(db *gorm.DB) models.QuestStore { return &store{db: db} }

func (s *store) ListActive() ([]models.Quest, error) {
	var qs []models.Quest
	err := s.db.Where("active = ?", true).Order("sort_order, created_at").Find(&qs).Error
	return qs, err
}

func (s *store) FindByID(id string) (*models.Quest, error) {
	var q models.Quest
	if err := s.db.First(&q, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &q, nil
}

func (s *store) ListPlayer(playerID string) ([]models.PlayerQuest, error) {
	var rows []models.PlayerQuest
	err := s.db.Where("player_id = ?", playerID).Find(&rows).Error
	return rows, err
}

// Advance increments (player, quest, period) progress inside tx. The row is
// created on first progress; the unique index absorbs create races.
func (s *store) Advance(tx *gorm.DB, playerID string, q *models.Quest, periodKey string, n int) (*models.PlayerQuest, error) {
	var row models.PlayerQuest
	err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		First(&row, "player_id = ? AND quest_id = ? AND period_key = ?", playerID, q.ID, periodKey).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		row = models.PlayerQuest{PlayerID: playerID, QuestID: q.ID, PeriodKey: periodKey, Status: models.PQActive}
		if cerr := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&row).Error; cerr != nil {
			return nil, cerr
		}
		// re-read (either our row or the concurrent winner's), locked
		if rerr := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			First(&row, "player_id = ? AND quest_id = ? AND period_key = ?", playerID, q.ID, periodKey).Error; rerr != nil {
			return nil, rerr
		}
	} else if err != nil {
		return nil, err
	}

	if row.Status != models.PQActive {
		return &row, nil // already completed/claimed this period
	}
	row.Progress += n
	updates := map[string]any{"progress": row.Progress}
	if row.Progress >= q.Target {
		now := time.Now()
		row.Status = models.PQCompleted
		row.CompletedAt = &now
		updates["status"] = row.Status
		updates["completed_at"] = now
	}
	if err := tx.Model(&models.PlayerQuest{}).Where("id = ?", row.ID).Updates(updates).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

// Claim flips COMPLETED -> CLAIMED guarded so double-claims can't pay twice.
func (s *store) Claim(tx *gorm.DB, playerID, questID, periodKey string) (int64, error) {
	res := tx.Model(&models.PlayerQuest{}).
		Where("player_id = ? AND quest_id = ? AND period_key = ? AND status = ?",
			playerID, questID, periodKey, models.PQCompleted).
		Updates(map[string]any{"status": models.PQClaimed, "claimed_at": time.Now()})
	return res.RowsAffected, res.Error
}

func (s *store) FindPlayerQuest(playerID, questID, periodKey string) (*models.PlayerQuest, error) {
	var row models.PlayerQuest
	if err := s.db.First(&row, "player_id = ? AND quest_id = ? AND period_key = ?",
		playerID, questID, periodKey).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

func (s *store) AddCommunity(tx *gorm.DB, questID, periodKey string, n int) (*models.CommunityProgress, error) {
	var row models.CommunityProgress
	err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		First(&row, "quest_id = ? AND period_key = ?", questID, periodKey).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		row = models.CommunityProgress{QuestID: questID, PeriodKey: periodKey}
		if cerr := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&row).Error; cerr != nil {
			return nil, cerr
		}
		if rerr := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			First(&row, "quest_id = ? AND period_key = ?", questID, periodKey).Error; rerr != nil {
			return nil, rerr
		}
	} else if err != nil {
		return nil, err
	}
	row.Progress += n
	if err := tx.Model(&models.CommunityProgress{}).Where("id = ?", row.ID).
		Update("progress", row.Progress).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

func (s *store) FindCommunity(questID, periodKey string) (*models.CommunityProgress, error) {
	var row models.CommunityProgress
	if err := s.db.First(&row, "quest_id = ? AND period_key = ?", questID, periodKey).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

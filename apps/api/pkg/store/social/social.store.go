package social

import (
	"errors"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	dsocial "neongather/pkg/domain/social"
	"neongather/pkg/models"
)

type store struct{ db *gorm.DB }

func New(db *gorm.DB) models.SocialStore { return &store{db: db} }

func (s *store) BumpRegular(tx *gorm.DB, playerID, shopID, menuName string) (*models.RegularStatus, error) {
	var row models.RegularStatus
	err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		First(&row, "player_id = ? AND shop_id = ? AND menu_name = ?", playerID, shopID, menuName).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		row = models.RegularStatus{PlayerID: playerID, ShopID: shopID, MenuName: menuName}
		if cerr := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&row).Error; cerr != nil {
			return nil, cerr
		}
		if rerr := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			First(&row, "player_id = ? AND shop_id = ? AND menu_name = ?", playerID, shopID, menuName).Error; rerr != nil {
			return nil, rerr
		}
	} else if err != nil {
		return nil, err
	}
	row.OrderCount++
	if err := tx.Model(&models.RegularStatus{}).Where("id = ?", row.ID).
		Update("order_count", row.OrderCount).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

func (s *store) MarkRegularAchieved(tx *gorm.DB, id string) error {
	return tx.Model(&models.RegularStatus{}).
		Where("id = ? AND achieved_at IS NULL", id).
		Update("achieved_at", time.Now()).Error
}

func (s *store) ListRegularsByPlayer(playerID string) ([]models.RegularStatus, error) {
	var rows []models.RegularStatus
	err := s.db.Preload("Shop").
		Where("player_id = ?", playerID).
		Order("order_count desc").Find(&rows).Error
	return rows, err
}

func (s *store) BumpCheers(tx *gorm.DB, aID, bID string) (*models.CheersLog, error) {
	a, b, err := dsocial.CanonicalPair(aID, bID)
	if err != nil {
		return nil, err
	}
	var row models.CheersLog
	ferr := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		First(&row, "player_a_id = ? AND player_b_id = ?", a, b).Error
	if errors.Is(ferr, gorm.ErrRecordNotFound) {
		row = models.CheersLog{PlayerAID: a, PlayerBID: b}
		if cerr := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&row).Error; cerr != nil {
			return nil, cerr
		}
		if rerr := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			First(&row, "player_a_id = ? AND player_b_id = ?", a, b).Error; rerr != nil {
			return nil, rerr
		}
	} else if ferr != nil {
		return nil, ferr
	}
	row.TotalCount++
	if err := tx.Model(&models.CheersLog{}).Where("id = ?", row.ID).
		Update("total_count", row.TotalCount).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

func (s *store) ListCheersByPlayer(playerID string) ([]models.CheersLog, error) {
	var rows []models.CheersLog
	err := s.db.Preload("PlayerA").Preload("PlayerB").
		Where("player_a_id = ? OR player_b_id = ?", playerID, playerID).
		Order("total_count desc").Find(&rows).Error
	return rows, err
}

// StampTasting records the first taste of a menu (dup-safe via the unique
// index). Returns whether this was a NEW stamp.
func (s *store) StampTasting(playerID, menuName string) (bool, error) {
	row := models.TastingStamp{PlayerID: playerID, MenuName: menuName}
	res := s.db.Clauses(clause.OnConflict{DoNothing: true}).Create(&row)
	return res.RowsAffected > 0, res.Error
}

func (s *store) ListStamps(playerID string) ([]models.TastingStamp, error) {
	var rows []models.TastingStamp
	err := s.db.Where("player_id = ?", playerID).Order("first_tried_at desc").Find(&rows).Error
	return rows, err
}

// CountDistinctMenus: the passport target is every distinct DRINK/FOOD item
// name players have created — the book grows with the economy by itself.
func (s *store) CountDistinctMenus() (int64, error) {
	var n int64
	err := s.db.Model(&models.Item{}).
		Where("category IN ?", []string{models.CategoryDrink, models.CategoryFood}).
		Distinct("name").Count(&n).Error
	return n, err
}

func (s *store) ListStories() ([]models.BartenderStory, error) {
	var rows []models.BartenderStory
	err := s.db.Order("sort_order").Find(&rows).Error
	return rows, err
}

func (s *store) UnlockStory(playerID, storyID string) (bool, error) {
	row := models.PlayerStory{PlayerID: playerID, StoryID: storyID}
	res := s.db.Clauses(clause.OnConflict{DoNothing: true}).Create(&row)
	return res.RowsAffected > 0, res.Error
}

func (s *store) ListPlayerStories(playerID string) ([]models.PlayerStory, error) {
	var rows []models.PlayerStory
	err := s.db.Preload("Story").
		Where("player_id = ?", playerID).
		Order("unlocked_at desc").Find(&rows).Error
	return rows, err
}

package coaster

import (
	"errors"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"neongather/pkg/domain/coasterrules"
	"neongather/pkg/models"
)

type store struct{ db *gorm.DB }

func New(db *gorm.DB) models.CoasterStore { return &store{db: db} }

func (s *store) EnsureCoaster(tx *gorm.DB, shopID, tier, season string) (*models.Coaster, error) {
	var c models.Coaster
	err := tx.First(&c, "shop_id = ? AND tier = ? AND season = ?", shopID, tier, season).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		c = models.Coaster{ShopID: shopID, Tier: tier, Season: season}
		if cerr := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&c).Error; cerr != nil {
			return nil, cerr
		}
		if rerr := tx.First(&c, "shop_id = ? AND tier = ? AND season = ?", shopID, tier, season).Error; rerr != nil {
			return nil, rerr
		}
	} else if err != nil {
		return nil, err
	}
	return &c, nil
}

// Grant locks the coaster row (serialising cap checks per coaster), verifies
// the shop's season cap, then inserts — the UNIQUE (player, coaster) index
// absorbs duplicate grants.
func (s *store) Grant(tx *gorm.DB, playerID, coasterID string, seasonCap int) (bool, error) {
	var c models.Coaster
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		First(&c, "id = ?", coasterID).Error; err != nil {
		return false, err
	}
	issued, err := s.IssuedCount(tx, c.ShopID, c.Season)
	if err != nil {
		return false, err
	}
	if !coasterrules.CapAllows(int(issued), seasonCap) {
		return false, nil
	}
	pc := models.PlayerCoaster{PlayerID: playerID, CoasterID: coasterID}
	res := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&pc)
	if res.Error != nil {
		return false, res.Error
	}
	return res.RowsAffected > 0, nil
}

func (s *store) ListByPlayer(playerID string) ([]models.PlayerCoaster, error) {
	var pcs []models.PlayerCoaster
	err := s.db.Preload("Coaster").Preload("Coaster.Shop").
		Where("player_id = ?", playerID).
		Order("obtained_at desc").Find(&pcs).Error
	return pcs, err
}

func (s *store) ListByShop(shopID string) ([]models.Coaster, error) {
	var cs []models.Coaster
	err := s.db.Where("shop_id = ?", shopID).Order("created_at").Find(&cs).Error
	return cs, err
}

func (s *store) FindCoaster(id string) (*models.Coaster, error) {
	var c models.Coaster
	if err := s.db.Preload("Shop").First(&c, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &c, nil
}

func (s *store) UpdateCoaster(c *models.Coaster) error { return s.db.Save(c).Error }

func (s *store) FindPlayerCoaster(id string) (*models.PlayerCoaster, error) {
	var pc models.PlayerCoaster
	if err := s.db.Preload("Coaster").Preload("Coaster.Shop").Preload("Player").
		First(&pc, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &pc, nil
}

func (s *store) ListForSale() ([]models.PlayerCoaster, error) {
	var pcs []models.PlayerCoaster
	err := s.db.Preload("Coaster").Preload("Coaster.Shop").Preload("Player").
		Where("listed_for_sale = ?", true).
		Order("obtained_at desc").Find(&pcs).Error
	return pcs, err
}

func (s *store) SetListing(id, ownerID string, listed bool, price int) (int64, error) {
	res := s.db.Model(&models.PlayerCoaster{}).
		Where("id = ? AND player_id = ?", id, ownerID).
		Updates(map[string]any{"listed_for_sale": listed, "price": price})
	return res.RowsAffected, res.Error
}

// ClaimListed transfers a listed coaster to the buyer. The guarded UPDATE
// beats seller-side races; the UNIQUE (player, coaster) index rejects buyers
// who already own the same coaster (surfaces as an error).
func (s *store) ClaimListed(tx *gorm.DB, id, sellerID, buyerID string) (int64, error) {
	res := tx.Model(&models.PlayerCoaster{}).
		Where("id = ? AND player_id = ? AND listed_for_sale = ?", id, sellerID, true).
		Updates(map[string]any{
			"player_id": buyerID, "listed_for_sale": false,
			"price": 0, "obtained_at": gorm.Expr("NOW()"),
		})
	return res.RowsAffected, res.Error
}

func (s *store) IssuedCount(tx *gorm.DB, shopID, season string) (int64, error) {
	var n int64
	err := tx.Model(&models.PlayerCoaster{}).
		Joins("JOIN coasters ON coasters.id = player_coasters.coaster_id").
		Where("coasters.shop_id = ? AND coasters.season = ?", shopID, season).
		Count(&n).Error
	return n, err
}

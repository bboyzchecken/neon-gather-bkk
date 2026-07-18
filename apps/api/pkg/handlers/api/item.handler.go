package api

import (
	"errors"
	"net/http"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"

	"neongather/pkg/domain/progression"
	"neongather/pkg/models"
)

func (s *Server) MyItems(c echo.Context) error {
	items, err := s.Items.FindByOwner(userID(c))
	if err != nil {
		return errJSON(c, http.StatusInternalServerError, "could not list items")
	}
	out := make([]itemDTO, 0, len(items))
	for _, it := range items {
		out = append(out, toItemDTO(it))
	}
	return c.JSON(http.StatusOK, out)
}

type createItemReq struct {
	Name         string `json:"name" validate:"required,min=1,max=40"`
	Category     string `json:"category" validate:"required,oneof=DRINK FOOD DECOR MATERIAL MISC"`
	Price        int    `json:"price" validate:"min=0,max=1000000"`
	ThumbnailURL string `json:"thumbnail_url" validate:"max=500"`
}

func (s *Server) CreateItem(c echo.Context) error {
	uid := userID(c)
	var body createItemReq
	if err := c.Bind(&body); err != nil {
		return errJSON(c, http.StatusBadRequest, "invalid body")
	}
	if err := c.Validate(&body); err != nil {
		return errJSON(c, http.StatusUnprocessableEntity, err.Error())
	}
	it := &models.Item{Name: body.Name, Category: body.Category, Price: body.Price, OwnerID: uid}
	if body.ThumbnailURL != "" {
		it.ThumbnailURL = &body.ThumbnailURL
	}
	if err := s.Items.Create(it); err != nil {
		return errJSON(c, http.StatusInternalServerError, "could not create item")
	}
	s.Progress.Fire(uid, models.EventItemCreate)
	dto := toItemDTO(*it)
	if u, err := s.Users.FindByID(uid); err == nil {
		dto.OwnerName = &u.DisplayName
	}
	return c.JSON(http.StatusCreated, dto)
}

func (s *Server) VendorSell(c echo.Context) error {
	id := c.Param("id")
	uid := userID(c)

	it, err := s.Items.FindByID(id)
	if err != nil {
		return errJSON(c, http.StatusNotFound, "item not found")
	}
	if it.OwnerID != uid {
		return errJSON(c, http.StatusForbidden, "you do not own this item")
	}

	// VENDOR perk: "Barista" branch mints a % bonus on vendor sales.
	payout := it.Price
	if row, err := s.Jobs.Find(uid, models.JobVendor); err == nil {
		bp := progression.EffectValue(models.JobVendor, row.Level, "vendor_sale_bonus_bp")
		payout = progression.ApplyBonusBP(payout, bp)
	}

	var earned, balance int
	err = s.DB.Transaction(func(tx *gorm.DB) error {
		n, e := s.Items.DeleteOwned(tx, id, uid)
		if e != nil {
			return e
		}
		if n == 0 {
			return errItemUnavailable
		}
		b, e := s.Wallet.ApplyDelta(tx, uid, payout, models.LedgerVendorSell, id, "vendor sell "+it.Name)
		if e != nil {
			return e
		}
		earned, balance = payout, b
		return nil
	})
	if err != nil {
		if errors.Is(err, errItemUnavailable) {
			return errJSON(c, http.StatusBadRequest, "item no longer available")
		}
		return errJSON(c, http.StatusInternalServerError, "sell failed")
	}
	_ = s.Leaderboard.AddEarnings(c.Request().Context(), uid, earned)
	s.Progress.Fire(uid, models.EventVendorSell)
	return c.JSON(http.StatusOK, map[string]int{"earned": earned, "balance": balance})
}

package api

import (
	"errors"
	"net/http"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"

	dwallet "neongather/pkg/domain/wallet"
	"neongather/pkg/models"
)

func (s *Server) BrowseMarket(c echo.Context) error {
	items, err := s.Items.ListForSale()
	if err != nil {
		return errJSON(c, http.StatusInternalServerError, "could not load marketplace")
	}
	out := make([]itemDTO, 0, len(items))
	for _, it := range items {
		out = append(out, toItemDTO(it))
	}
	return c.JSON(http.StatusOK, out)
}

type listItemReq struct {
	Price int `json:"price" validate:"required,min=1,max=1000000"`
}

func (s *Server) ListForSale(c echo.Context) error {
	id := c.Param("id")
	uid := userID(c)

	var body listItemReq
	if err := c.Bind(&body); err != nil {
		return errJSON(c, http.StatusBadRequest, "invalid body")
	}
	if err := c.Validate(&body); err != nil {
		return errJSON(c, http.StatusUnprocessableEntity, err.Error())
	}

	it, err := s.Items.FindByID(id)
	if err != nil {
		return errJSON(c, http.StatusNotFound, "item not found")
	}
	if it.OwnerID != uid {
		return errJSON(c, http.StatusForbidden, "you do not own this item")
	}
	it.ListedForSale = true
	it.Price = body.Price
	if err := s.Items.Update(it); err != nil {
		return errJSON(c, http.StatusInternalServerError, "list failed")
	}
	full, _ := s.Items.FindByID(id)
	dto := toItemDTO(*full)
	if u, err := s.Users.FindByID(uid); err == nil {
		dto.OwnerName = &u.DisplayName
	}
	return c.JSON(http.StatusOK, dto)
}

func (s *Server) Unlist(c echo.Context) error {
	id := c.Param("id")
	uid := userID(c)

	it, err := s.Items.FindByID(id)
	if err != nil {
		return errJSON(c, http.StatusNotFound, "item not found")
	}
	if it.OwnerID != uid {
		return errJSON(c, http.StatusForbidden, "you do not own this item")
	}
	it.ListedForSale = false
	if err := s.Items.Update(it); err != nil {
		return errJSON(c, http.StatusInternalServerError, "unlist failed")
	}
	dto := toItemDTO(*it)
	if u, err := s.Users.FindByID(uid); err == nil {
		dto.OwnerName = &u.DisplayName
	}
	return c.JSON(http.StatusOK, dto)
}

func (s *Server) Buy(c echo.Context) error {
	id := c.Param("id")
	buyerID := userID(c)

	it, err := s.Items.FindByID(id)
	if err != nil {
		return errJSON(c, http.StatusNotFound, "item not found")
	}
	if !it.ListedForSale {
		return errJSON(c, http.StatusBadRequest, "item is not for sale")
	}
	if it.OwnerID == buyerID {
		return errJSON(c, http.StatusBadRequest, "cannot buy your own item")
	}
	sellerID := it.OwnerID
	price := it.Price

	var result itemDTO
	err = s.DB.Transaction(func(tx *gorm.DB) error {
		n, e := s.Items.ClaimForSale(tx, id, sellerID, buyerID)
		if e != nil {
			return e
		}
		if n == 0 {
			return errItemUnavailable
		}
		// Zero-sum settlement: buyer -price, seller +price.
		if _, e := s.Wallet.ApplyDelta(tx, buyerID, -price, models.LedgerMarketBuy, id, "buy "+it.Name); e != nil {
			return e
		}
		if _, e := s.Wallet.ApplyDelta(tx, sellerID, price, models.LedgerMarketSell, id, "sell "+it.Name); e != nil {
			return e
		}
		full, e := s.Items.ReloadWithOwner(tx, id)
		if e != nil {
			return e
		}
		result = toItemDTO(*full)
		return nil
	})
	if err != nil {
		switch {
		case errors.Is(err, errItemUnavailable):
			return errJSON(c, http.StatusBadRequest, "item no longer available")
		case errors.Is(err, dwallet.ErrInsufficientFunds):
			return errJSON(c, http.StatusBadRequest, "insufficient funds")
		default:
			return errJSON(c, http.StatusInternalServerError, "purchase failed")
		}
	}
	_ = s.Leaderboard.AddEarnings(c.Request().Context(), sellerID, price)
	return c.JSON(http.StatusOK, result)
}

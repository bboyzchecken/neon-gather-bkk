package api

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"

	dwallet "neongather/pkg/domain/wallet"
	"neongather/pkg/models"
)

// Coaster trading over the existing marketplace rails (Phase 2 §1):
// player→player, zero-sum coins, guarded transfer; the UNIQUE
// (player, coaster) index makes owning duplicates impossible.

type listedCoasterDTO struct {
	playerCoasterDTO
	ListingID  string  `json:"listing_id"`
	Price      int     `json:"price"`
	SellerID   string  `json:"seller_id"`
	SellerName *string `json:"seller_name"`
}

func toListedCoasterDTO(pc models.PlayerCoaster) listedCoasterDTO {
	dto := listedCoasterDTO{ListingID: pc.ID, Price: pc.Price, SellerID: pc.PlayerID}
	if pc.Coaster != nil {
		dto.playerCoasterDTO = playerCoasterDTO{
			coasterDTO:    toCoasterDTO(*pc.Coaster),
			OwnedID:       pc.ID,
			ObtainedAt:    pc.ObtainedAt.Format(time.RFC3339),
			ListedForSale: pc.ListedForSale,
			Price:         pc.Price,
		}
	}
	if pc.Player != nil {
		name := pc.Player.DisplayName
		dto.SellerName = &name
	}
	return dto
}

type listCoasterReq struct {
	Price int `json:"price" validate:"required,min=1,max=1000000"`
}

func (s *Server) ListCoasterForSale(c echo.Context) error {
	uid := userID(c)
	var body listCoasterReq
	if err := c.Bind(&body); err != nil {
		return errJSON(c, http.StatusBadRequest, "invalid body")
	}
	if err := c.Validate(&body); err != nil {
		return errJSON(c, http.StatusUnprocessableEntity, err.Error())
	}
	n, err := s.Coasters.SetListing(c.Param("id"), uid, true, body.Price)
	if err != nil {
		return errJSON(c, http.StatusInternalServerError, "list failed")
	}
	if n == 0 {
		return errJSON(c, http.StatusNotFound, "coaster not found or not yours")
	}
	return c.JSON(http.StatusOK, map[string]bool{"listed": true})
}

func (s *Server) UnlistCoaster(c echo.Context) error {
	n, err := s.Coasters.SetListing(c.Param("id"), userID(c), false, 0)
	if err != nil {
		return errJSON(c, http.StatusInternalServerError, "unlist failed")
	}
	if n == 0 {
		return errJSON(c, http.StatusNotFound, "coaster not found or not yours")
	}
	return c.JSON(http.StatusOK, map[string]bool{"listed": false})
}

func (s *Server) BrowseCoasterMarket(c echo.Context) error {
	pcs, err := s.Coasters.ListForSale()
	if err != nil {
		return errJSON(c, http.StatusInternalServerError, "could not load coaster market")
	}
	out := make([]listedCoasterDTO, 0, len(pcs))
	for _, pc := range pcs {
		out = append(out, toListedCoasterDTO(pc))
	}
	return c.JSON(http.StatusOK, out)
}

func (s *Server) BuyCoaster(c echo.Context) error {
	buyerID := userID(c)
	pc, err := s.Coasters.FindPlayerCoaster(c.Param("id"))
	if err != nil {
		return errJSON(c, http.StatusNotFound, "listing not found")
	}
	if !pc.ListedForSale {
		return errJSON(c, http.StatusBadRequest, "coaster is not for sale")
	}
	if pc.PlayerID == buyerID {
		return errJSON(c, http.StatusBadRequest, "cannot buy your own coaster")
	}
	sellerID := pc.PlayerID
	price := pc.Price

	err = s.DB.Transaction(func(tx *gorm.DB) error {
		n, e := s.Coasters.ClaimListed(tx, pc.ID, sellerID, buyerID)
		if e != nil {
			return e
		}
		if n == 0 {
			return errItemUnavailable
		}
		if _, e := s.Wallet.ApplyDelta(tx, buyerID, -price, models.LedgerMarketBuy, pc.ID, "buy coaster"); e != nil {
			return e
		}
		if _, e := s.Wallet.ApplyDelta(tx, sellerID, price, models.LedgerMarketSell, pc.ID, "sell coaster"); e != nil {
			return e
		}
		return nil
	})
	if err != nil {
		switch {
		case errors.Is(err, errItemUnavailable):
			return errJSON(c, http.StatusBadRequest, "coaster no longer available")
		case errors.Is(err, dwallet.ErrInsufficientFunds):
			return errJSON(c, http.StatusBadRequest, "insufficient funds")
		case strings.Contains(strings.ToLower(err.Error()), "duplicate") ||
			strings.Contains(strings.ToLower(err.Error()), "unique"):
			// UNIQUE (player, coaster): buyer already owns this design
			return errJSON(c, http.StatusBadRequest, "you already own this coaster")
		default:
			return errJSON(c, http.StatusInternalServerError, "purchase failed")
		}
	}
	_ = s.Leaderboard.AddEarnings(c.Request().Context(), sellerID, price)
	s.Progress.Fire(buyerID, models.EventMarketBuy)
	s.Progress.Fire(sellerID, models.EventMarketSell)
	s.Hub.SendTo(sellerID, map[string]any{
		"type": "coaster_sold", "listing_id": pc.ID, "price": price,
	})
	return c.JSON(http.StatusOK, map[string]any{"bought": true, "price": price})
}

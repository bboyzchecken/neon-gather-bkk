package api

import (
	"errors"
	"net/http"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"

	dwallet "neongather/pkg/domain/wallet"
	"neongather/pkg/domain/progression"
	"neongather/pkg/models"
)

const (
	vendingBaseStockCap  = 10 // raised by VENDOR "Stockmaster" perks
	vendingLowStockAlert = 2
)

type vendingSlotDTO struct {
	ID           string  `json:"id"`
	ItemName     string  `json:"item_name"`
	Category     string  `json:"category"`
	ThumbnailURL *string `json:"thumbnail_url"`
	Price        int     `json:"price"`
	Stock        int     `json:"stock"`
}

type vendingDTO struct {
	ID        string           `json:"id"`
	Code      string           `json:"code"`
	PlotID    *string          `json:"plot_id"`
	OwnerID   string           `json:"owner_id"`
	OwnerName *string          `json:"owner_name"`
	Floor     int              `json:"floor"`
	GridX     int              `json:"grid_x"`
	GridY     int              `json:"grid_y"`
	Slots     []vendingSlotDTO `json:"slots"`
}

func toVendingDTO(m models.VendingMachine) vendingDTO {
	dto := vendingDTO{
		ID: m.ID, Code: m.Code, PlotID: m.PlotID, OwnerID: m.OwnerID,
		Floor: m.Floor, GridX: m.GridX, GridY: m.GridY,
		Slots: make([]vendingSlotDTO, 0, len(m.Slots)),
	}
	if m.Owner != nil {
		name := m.Owner.DisplayName
		dto.OwnerName = &name
	}
	for _, sl := range m.Slots {
		dto.Slots = append(dto.Slots, vendingSlotDTO{
			ID: sl.ID, ItemName: sl.ItemName, Category: sl.Category,
			ThumbnailURL: sl.ThumbnailURL, Price: sl.Price, Stock: sl.Stock,
		})
	}
	return dto
}

func (s *Server) ListVending(c echo.Context) error {
	ms, err := s.Vending.List()
	if err != nil {
		return errJSON(c, http.StatusInternalServerError, "could not list vending machines")
	}
	out := make([]vendingDTO, 0, len(ms))
	for _, m := range ms {
		out = append(out, toVendingDTO(m))
	}
	return c.JSON(http.StatusOK, out)
}

// BuyVending: guarded stock claim + zero-sum coin transfer + item minted to
// the buyer, all in one transaction.
func (s *Server) BuyVending(c echo.Context) error {
	uid := userID(c)
	slot, err := s.Vending.FindSlot(c.Param("slot_id"))
	if err != nil {
		return errJSON(c, http.StatusNotFound, "slot not found")
	}
	machine, err := s.Vending.FindByID(slot.MachineID)
	if err != nil {
		return errJSON(c, http.StatusNotFound, "machine not found")
	}
	if machine.OwnerID == uid {
		return errJSON(c, http.StatusBadRequest, "cannot buy from your own machine")
	}

	var item models.Item
	var stockLeft int
	err = s.DB.Transaction(func(tx *gorm.DB) error {
		n, e := s.Vending.ClaimStock(tx, slot.ID)
		if e != nil {
			return e
		}
		if n == 0 {
			return errOutOfStock
		}
		if _, e := s.Wallet.ApplyDelta(tx, uid, -slot.Price, models.LedgerVendingBuy, slot.ID, "vending buy "+slot.ItemName); e != nil {
			return e
		}
		if _, e := s.Wallet.ApplyDelta(tx, machine.OwnerID, slot.Price, models.LedgerVendingSell, slot.ID, "vending sell "+slot.ItemName); e != nil {
			return e
		}
		item = models.Item{
			Name: slot.ItemName, Category: slot.Category, Price: slot.Price,
			ThumbnailURL: slot.ThumbnailURL, OwnerID: uid,
		}
		if e := tx.Create(&item).Error; e != nil {
			return e
		}
		fresh, e := s.Vending.ReloadSlot(tx, slot.ID)
		if e != nil {
			return e
		}
		stockLeft = fresh.Stock
		return nil
	})
	if err != nil {
		switch {
		case errors.Is(err, errOutOfStock):
			return errJSON(c, http.StatusBadRequest, "out of stock")
		case errors.Is(err, dwallet.ErrInsufficientFunds):
			return errJSON(c, http.StatusBadRequest, "insufficient funds")
		default:
			return errJSON(c, http.StatusInternalServerError, "purchase failed")
		}
	}

	_ = s.Leaderboard.AddEarnings(c.Request().Context(), machine.OwnerID, slot.Price)
	s.Progress.Fire(uid, models.EventVendingBuy)
	s.Progress.Fire(machine.OwnerID, models.EventVendingSold)
	s.Hub.BroadcastJSON(map[string]any{
		"type": "vending_updated", "machine_id": machine.ID, "slot_id": slot.ID, "stock": stockLeft,
	})
	if stockLeft <= vendingLowStockAlert {
		s.Hub.SendTo(machine.OwnerID, map[string]any{
			"type": "vending_low_stock", "machine_id": machine.ID,
			"slot_id": slot.ID, "item_name": slot.ItemName, "stock": stockLeft,
		})
	}
	return c.JSON(http.StatusOK, map[string]any{
		"item": toItemDTO(item), "stock": stockLeft,
	})
}

type restockReq struct {
	Add int `json:"add" validate:"required,min=1,max=100"`
}

// RestockVending lets the owner top a slot up (cap grows with VENDOR perks).
func (s *Server) RestockVending(c echo.Context) error {
	uid := userID(c)
	slot, err := s.Vending.FindSlot(c.Param("slot_id"))
	if err != nil {
		return errJSON(c, http.StatusNotFound, "slot not found")
	}
	machine, err := s.Vending.FindByID(slot.MachineID)
	if err != nil {
		return errJSON(c, http.StatusNotFound, "machine not found")
	}
	if machine.OwnerID != uid {
		return errJSON(c, http.StatusForbidden, "not your machine")
	}
	var body restockReq
	if err := c.Bind(&body); err != nil {
		return errJSON(c, http.StatusBadRequest, "invalid body")
	}
	if err := c.Validate(&body); err != nil {
		return errJSON(c, http.StatusUnprocessableEntity, err.Error())
	}

	cap := vendingBaseStockCap
	if row, err := s.Jobs.Find(uid, models.JobVendor); err == nil {
		if v := progression.EffectValue(models.JobVendor, row.Level, "vending_stock_cap"); v > cap {
			cap = v
		}
	}

	var stock int
	err = s.DB.Transaction(func(tx *gorm.DB) error {
		n, e := s.Vending.Restock(tx, slot.ID, body.Add, cap)
		if e != nil {
			return e
		}
		if n == 0 {
			return errStockCap
		}
		fresh, e := s.Vending.ReloadSlot(tx, slot.ID)
		if e != nil {
			return e
		}
		stock = fresh.Stock
		return nil
	})
	if err != nil {
		if errors.Is(err, errStockCap) {
			return errJSON(c, http.StatusBadRequest, "over stock cap")
		}
		return errJSON(c, http.StatusInternalServerError, "restock failed")
	}
	s.Hub.BroadcastJSON(map[string]any{
		"type": "vending_updated", "machine_id": machine.ID, "slot_id": slot.ID, "stock": stock,
	})
	return c.JSON(http.StatusOK, map[string]any{"stock": stock, "cap": cap})
}

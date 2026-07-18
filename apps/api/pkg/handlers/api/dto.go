package api

import (
	"errors"

	"github.com/labstack/echo/v4"
	"neongather/pkg/models"
)

// Shared sentinels for transactional flows.
var (
	errPlotUnavailable   = errors.New("plot is not available")
	errItemUnavailable   = errors.New("item no longer available")
	errQuestNotClaimable = errors.New("quest is not claimable")
	errOutOfStock        = errors.New("out of stock")
	errStockCap          = errors.New("over stock cap")
)

// ---- helpers ----

func errJSON(c echo.Context, status int, msg string) error {
	return c.JSON(status, map[string]string{"error": msg})
}

func userID(c echo.Context) string {
	v, _ := c.Get("user_id").(string)
	return v
}

// ---- DTOs (snake_case wire shapes) ----

type plotDTO struct {
	ID               string  `json:"id"`
	Code             string  `json:"code"`
	GridX            int     `json:"grid_x"`
	GridY            int     `json:"grid_y"`
	WidthTiles       int     `json:"width_tiles"`
	HeightTiles      int     `json:"height_tiles"`
	Status           string  `json:"status"`
	OwnerID          *string `json:"owner_id"`
	OwnerName        *string `json:"owner_name"`
	IsMine           bool    `json:"is_mine"`
	FacadeTemplate   string  `json:"facade_template"`
	FacadeTextureURL *string `json:"facade_texture_url"`
	FacadeModeration *string `json:"facade_moderation"`
	RentPrice        int     `json:"rent_price"`
}

func toPlotDTO(p models.Plot, uid string) plotDTO {
	var ownerName *string
	if p.Owner != nil {
		name := p.Owner.DisplayName
		ownerName = &name
	}
	return plotDTO{
		ID:               p.ID,
		Code:             p.Code,
		GridX:            p.GridX,
		GridY:            p.GridY,
		WidthTiles:       p.WidthTiles,
		HeightTiles:      p.HeightTiles,
		Status:           p.Status,
		OwnerID:          p.OwnerID,
		OwnerName:        ownerName,
		IsMine:           p.OwnerID != nil && *p.OwnerID == uid,
		FacadeTemplate:   p.FacadeTemplate,
		FacadeTextureURL: p.FacadeTextureURL,
		FacadeModeration: p.FacadeModeration,
		RentPrice:        p.RentPrice,
	}
}

type itemDTO struct {
	ID            string  `json:"id"`
	Name          string  `json:"name"`
	Category      string  `json:"category"`
	Price         int     `json:"price"`
	ThumbnailURL  *string `json:"thumbnail_url"`
	Rarity        *string `json:"rarity"`
	OwnerID       string  `json:"owner_id"`
	OwnerName     *string `json:"owner_name"`
	ListedForSale bool    `json:"listed_for_sale"`
}

func toItemDTO(it models.Item) itemDTO {
	var ownerName *string
	if it.Owner != nil {
		name := it.Owner.DisplayName
		ownerName = &name
	}
	return itemDTO{
		ID:            it.ID,
		Name:          it.Name,
		Category:      it.Category,
		Price:         it.Price,
		ThumbnailURL:  it.ThumbnailURL,
		Rarity:        it.Rarity,
		OwnerID:       it.OwnerID,
		OwnerName:     ownerName,
		ListedForSale: it.ListedForSale,
	}
}

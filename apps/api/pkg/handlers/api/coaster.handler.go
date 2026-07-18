package api

import (
	"io"
	"net/http"
	"time"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"

	"neongather/pkg/domain/coasterrules"
	"neongather/pkg/logger"
	"neongather/pkg/models"
)

// Coasters (Phase 2 §1). Bar-social iron rule: a coaster proves presence —
// it is only granted by ordering at the shop, never sold directly.

type coasterDTO struct {
	ID         string  `json:"id"`
	ShopID     string  `json:"shop_id"`
	ShopCode   *string `json:"shop_code"`
	Tier       string  `json:"tier"`
	Season     string  `json:"season"`
	ImageURL   *string `json:"image_url"`
	Moderation *string `json:"moderation"`
}

type playerCoasterDTO struct {
	coasterDTO
	ObtainedAt string `json:"obtained_at"`
}

func toCoasterDTO(c models.Coaster) coasterDTO {
	dto := coasterDTO{
		ID: c.ID, ShopID: c.ShopID, Tier: c.Tier, Season: c.Season,
		ImageURL: c.ImageURL, Moderation: c.Moderation,
	}
	if c.Shop != nil {
		code := c.Shop.Code
		dto.ShopCode = &code
	}
	return dto
}

func (s *Server) MyCoasters(c echo.Context) error {
	pcs, err := s.Coasters.ListByPlayer(userID(c))
	if err != nil {
		return errJSON(c, http.StatusInternalServerError, "could not list coasters")
	}
	out := make([]playerCoasterDTO, 0, len(pcs))
	for _, pc := range pcs {
		if pc.Coaster == nil {
			continue
		}
		out = append(out, playerCoasterDTO{
			coasterDTO: toCoasterDTO(*pc.Coaster),
			ObtainedAt: pc.ObtainedAt.Format(time.RFC3339),
		})
	}
	return c.JSON(http.StatusOK, out)
}

func (s *Server) ShopCoasters(c echo.Context) error {
	cs, err := s.Coasters.ListByShop(c.Param("id"))
	if err != nil {
		return errJSON(c, http.StatusInternalServerError, "could not list shop coasters")
	}
	out := make([]coasterDTO, 0, len(cs))
	for _, co := range cs {
		out = append(out, toCoasterDTO(co))
	}
	return c.JSON(http.StatusOK, out)
}

// UploadCoasterDesign lets the shop owner set the 256×256 art of their
// STANDARD coaster for the current season (moderated upload, like facades).
func (s *Server) UploadCoasterDesign(c echo.Context) error {
	uid := userID(c)
	plot, err := s.Plots.FindByID(c.Param("id"))
	if err != nil {
		return errJSON(c, http.StatusNotFound, "plot not found")
	}
	if plot.OwnerID == nil || *plot.OwnerID != uid {
		return errJSON(c, http.StatusForbidden, "you do not own this shop")
	}

	fileHeader, err := c.FormFile("file")
	if err != nil {
		return errJSON(c, http.StatusBadRequest, "no file uploaded")
	}
	contentType := fileHeader.Header.Get("Content-Type")
	verdict := s.Moderation.Screen(contentType, int(fileHeader.Size))
	if !verdict.OK {
		return errJSON(c, http.StatusBadRequest, verdict.Reason)
	}
	f, err := fileHeader.Open()
	if err != nil {
		return errJSON(c, http.StatusBadRequest, "cannot read file")
	}
	defer f.Close()
	data, err := io.ReadAll(f)
	if err != nil {
		return errJSON(c, http.StatusBadRequest, "cannot read file")
	}
	url, err := s.Storage.Upload(c.Request().Context(), data, contentType, "coasters/"+plot.ID)
	if err != nil {
		return errJSON(c, http.StatusInternalServerError, "upload failed")
	}

	var out models.Coaster
	err = s.DB.Transaction(func(tx *gorm.DB) error {
		co, e := s.Coasters.EnsureCoaster(tx, plot.ID, models.CoasterStandard, s.Config.CoasterSeason)
		if e != nil {
			return e
		}
		status := verdict.Status
		co.ImageURL = &url
		co.Moderation = &status
		out = *co
		return tx.Save(co).Error
	})
	if err != nil {
		return errJSON(c, http.StatusInternalServerError, "could not save design")
	}
	out.Shop = plot
	return c.JSON(http.StatusOK, toCoasterDTO(out))
}

// grantOrderCoasters issues coasters for an order at a shop plot: STANDARD
// on first order, plus OPENING_NIGHT while the server-time window (7 days
// from rented_at) is open. Runs after the order committed; failures only log.
func (s *Server) grantOrderCoasters(playerID string, plotID string) {
	plot, err := s.Plots.FindByID(plotID)
	if err != nil || plot.Status != models.PlotRented {
		return
	}
	season := s.Config.CoasterSeason
	cap := s.Config.CoasterSeasonCap
	now := time.Now()

	tiers := []string{models.CoasterStandard}
	if plot.RentedAt != nil && coasterrules.IsOpeningNight(*plot.RentedAt, now) {
		tiers = append(tiers, models.CoasterOpeningNight)
	}
	for _, tier := range tiers {
		var granted bool
		var coasterID string
		err := s.DB.Transaction(func(tx *gorm.DB) error {
			co, e := s.Coasters.EnsureCoaster(tx, plot.ID, tier, season)
			if e != nil {
				return e
			}
			coasterID = co.ID
			g, e := s.Coasters.Grant(tx, playerID, co.ID, cap)
			granted = g
			return e
		})
		if err != nil {
			logger.Log.WithError(err).Warn("coaster grant failed")
			continue
		}
		if granted {
			s.Hub.SendTo(playerID, map[string]any{
				"type": "coaster_granted", "tier": tier,
				"shop_code": plot.Code, "coaster_id": coasterID,
			})
		}
	}
}

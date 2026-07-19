package api

import (
	"errors"
	"net/http"
	"time"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"

	dsocial "neongather/pkg/domain/social"
	"neongather/pkg/logger"
	"neongather/pkg/models"
)

// Bar social (Phase 2 §2): regular status + cheers. Iron rule: cheers only
// between two REAL players verified present in the live hub RIGHT NOW —
// positions come from the server's own connection state, never the client.

type cheersReq struct {
	PlayerID string `json:"player_id" validate:"required"`
}

func (s *Server) Cheers(c echo.Context) error {
	uid := userID(c)
	var body cheersReq
	if err := c.Bind(&body); err != nil {
		return errJSON(c, http.StatusBadRequest, "invalid body")
	}
	if err := c.Validate(&body); err != nil {
		return errJSON(c, http.StatusUnprocessableEntity, err.Error())
	}
	if body.PlayerID == uid {
		return errJSON(c, http.StatusBadRequest, "cannot cheers with yourself")
	}
	// presence check: both connected, physically close in the live world
	x1, y1, f1, ok1 := s.Hub.Position(uid)
	x2, y2, f2, ok2 := s.Hub.Position(body.PlayerID)
	if !ok1 || !ok2 {
		return errJSON(c, http.StatusBadRequest, "you both need to be in the avenue")
	}
	if f1 != f2 {
		return errJSON(c, http.StatusBadRequest, "you are on different floors")
	}
	if !dsocial.WithinCheersRange(x1, y1, x2, y2) {
		return errJSON(c, http.StatusBadRequest, "walk closer to cheers")
	}
	// target must be a real player account, never a bot/NPC entity
	target, err := s.Users.FindByID(body.PlayerID)
	if err != nil {
		return errJSON(c, http.StatusNotFound, "player not found")
	}

	var row *models.CheersLog
	err = s.DB.Transaction(func(tx *gorm.DB) error {
		r, e := s.Social.BumpCheers(tx, uid, body.PlayerID)
		row = r
		return e
	})
	if err != nil {
		if errors.Is(err, dsocial.ErrSelfCheers) {
			return errJSON(c, http.StatusBadRequest, "cannot cheers with yourself")
		}
		return errJSON(c, http.StatusInternalServerError, "cheers failed")
	}

	s.Progress.Fire(uid, models.EventCheers)
	s.Progress.Fire(body.PlayerID, models.EventCheers)
	me, _ := s.Users.FindByID(uid)
	fromName := uid
	if me != nil {
		fromName = me.DisplayName
	}
	s.Hub.SendTo(body.PlayerID, map[string]any{
		"type": "cheers", "from_id": uid, "from_name": fromName, "total": row.TotalCount,
	})
	logger.Log.WithField("with", target.DisplayName).Debug("cheers logged")
	return c.JSON(http.StatusOK, map[string]any{"total": row.TotalCount})
}

func (s *Server) MyRegulars(c echo.Context) error {
	rows, err := s.Social.ListRegularsByPlayer(userID(c))
	if err != nil {
		return errJSON(c, http.StatusInternalServerError, "could not list regulars")
	}
	type regularDTO struct {
		ShopID     string  `json:"shop_id"`
		ShopCode   *string `json:"shop_code"`
		MenuName   string  `json:"menu_name"`
		OrderCount int     `json:"order_count"`
		Threshold  int     `json:"threshold"`
		AchievedAt *string `json:"achieved_at"`
	}
	out := make([]regularDTO, 0, len(rows))
	for _, r := range rows {
		dto := regularDTO{
			ShopID: r.ShopID, MenuName: r.MenuName,
			OrderCount: r.OrderCount, Threshold: s.Config.RegularThreshold,
		}
		if r.Shop != nil {
			code := r.Shop.Code
			dto.ShopCode = &code
		}
		if r.AchievedAt != nil {
			a := r.AchievedAt.Format(time.RFC3339)
			dto.AchievedAt = &a
		}
		out = append(out, dto)
	}
	return c.JSON(http.StatusOK, out)
}

func (s *Server) MyCheers(c echo.Context) error {
	uid := userID(c)
	rows, err := s.Social.ListCheersByPlayer(uid)
	if err != nil {
		return errJSON(c, http.StatusInternalServerError, "could not list cheers")
	}
	type cheersDTO struct {
		PartnerID     string `json:"partner_id"`
		PartnerName   string `json:"partner_name"`
		TotalCount    int    `json:"total_count"`
		FirstCheersAt string `json:"first_cheers_at"`
	}
	out := make([]cheersDTO, 0, len(rows))
	for _, r := range rows {
		dto := cheersDTO{TotalCount: r.TotalCount, FirstCheersAt: r.FirstCheersAt.Format(time.RFC3339)}
		if r.PlayerAID == uid {
			dto.PartnerID = r.PlayerBID
			if r.PlayerB != nil {
				dto.PartnerName = r.PlayerB.DisplayName
			}
		} else {
			dto.PartnerID = r.PlayerAID
			if r.PlayerA != nil {
				dto.PartnerName = r.PlayerA.DisplayName
			}
		}
		out = append(out, dto)
	}
	return c.JSON(http.StatusOK, out)
}

// trackRegular counts a successful order toward regular status and, exactly
// at the threshold, marks it achieved + grants the shop's REGULAR coaster.
func (s *Server) trackRegular(playerID, plotID, menuName string) {
	plot, err := s.Plots.FindByID(plotID)
	if err != nil || plot.Status != models.PlotRented {
		return
	}
	var achieved bool
	err = s.DB.Transaction(func(tx *gorm.DB) error {
		row, e := s.Social.BumpRegular(tx, playerID, plot.ID, menuName)
		if e != nil {
			return e
		}
		if row.AchievedAt == nil && dsocial.ReachedRegular(row.OrderCount, s.Config.RegularThreshold) {
			if e := s.Social.MarkRegularAchieved(tx, row.ID); e != nil {
				return e
			}
			co, e := s.Coasters.EnsureCoaster(tx, plot.ID, models.CoasterRegular, s.Config.CoasterSeason)
			if e != nil {
				return e
			}
			if _, e := s.Coasters.Grant(tx, playerID, co.ID, s.Config.CoasterSeasonCap); e != nil {
				return e
			}
			achieved = true
		}
		return nil
	})
	if err != nil {
		logger.Log.WithError(err).Warn("regular tracking failed")
		return
	}
	if achieved {
		s.Hub.SendTo(playerID, map[string]any{
			"type": "regular_achieved", "shop_code": plot.Code, "menu_name": menuName,
		})
	}
}

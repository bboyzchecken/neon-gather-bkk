package api

import (
	"errors"
	"math/rand"
	"net/http"
	"time"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"

	dwallet "neongather/pkg/domain/wallet"
	"neongather/pkg/models"
)

// Phase 2 §3 (tasting passport) + §5 (gachapon, bartender stories).

// Passport returns the tasting book: every menu the player has tried vs the
// number of distinct DRINK/FOOD menus that exist right now — the target
// grows with player-created content by itself.
func (s *Server) Passport(c echo.Context) error {
	uid := userID(c)
	stamps, err := s.Social.ListStamps(uid)
	if err != nil {
		return errJSON(c, http.StatusInternalServerError, "could not load passport")
	}
	total, err := s.Social.CountDistinctMenus()
	if err != nil {
		return errJSON(c, http.StatusInternalServerError, "could not load passport")
	}
	type stampDTO struct {
		MenuName     string `json:"menu_name"`
		FirstTriedAt string `json:"first_tried_at"`
	}
	out := make([]stampDTO, 0, len(stamps))
	for _, st := range stamps {
		out = append(out, stampDTO{MenuName: st.MenuName, FirstTriedAt: st.FirstTriedAt.Format(time.RFC3339)})
	}
	percent := 0
	if total > 0 {
		percent = int(float64(len(stamps)) / float64(total) * 100)
		if percent > 100 {
			percent = 100
		}
	}
	return c.JSON(http.StatusOK, map[string]any{
		"stamps": out, "total_menus": total, "percent": percent,
	})
}

const gachaDupRefund = 10

// SpinGacha: coins sink in, a random shop's SEASONAL coaster comes out —
// feeding the §1 collection. Duplicates refund a few coins.
func (s *Server) SpinGacha(c echo.Context) error {
	uid := userID(c)
	price := s.Config.GachaPrice

	plots, err := s.Plots.List()
	if err != nil {
		return errJSON(c, http.StatusInternalServerError, "gacha jammed")
	}
	rented := make([]models.Plot, 0, len(plots))
	for _, p := range plots {
		if p.Status == models.PlotRented {
			rented = append(rented, p)
		}
	}
	if len(rented) == 0 {
		return errJSON(c, http.StatusBadRequest, "no shops are open yet — nothing to win")
	}
	pick := rented[rand.Intn(len(rented))]

	var granted bool
	var balance int
	err = s.DB.Transaction(func(tx *gorm.DB) error {
		b, e := s.Wallet.ApplyDelta(tx, uid, -price, models.LedgerGachaSpin, pick.ID, "gacha spin")
		if e != nil {
			return e
		}
		balance = b
		co, e := s.Coasters.EnsureCoaster(tx, pick.ID, models.CoasterSeasonal, s.Config.CoasterSeason)
		if e != nil {
			return e
		}
		g, e := s.Coasters.Grant(tx, uid, co.ID, s.Config.CoasterSeasonCap)
		if e != nil {
			return e
		}
		granted = g
		if !granted {
			b, e := s.Wallet.ApplyDelta(tx, uid, gachaDupRefund, models.LedgerGachaDup, pick.ID, "gacha duplicate")
			if e != nil {
				return e
			}
			balance = b
		}
		return nil
	})
	if err != nil {
		if errors.Is(err, dwallet.ErrInsufficientFunds) {
			return errJSON(c, http.StatusBadRequest, "insufficient funds")
		}
		return errJSON(c, http.StatusInternalServerError, "gacha jammed")
	}
	s.Progress.Fire(uid, models.EventGachaSpin)
	return c.JSON(http.StatusOK, map[string]any{
		"granted": granted, "shop_code": pick.Code,
		"tier": models.CoasterSeasonal, "refund": map[bool]int{true: 0, false: gachaDupRefund}[granted],
		"balance": balance,
	})
}

// MyStories lists the player's unlocked bartender stories.
func (s *Server) MyStories(c echo.Context) error {
	rows, err := s.Social.ListPlayerStories(userID(c))
	if err != nil {
		return errJSON(c, http.StatusInternalServerError, "could not load stories")
	}
	type storyDTO struct {
		Code       string `json:"code"`
		Title      string `json:"title"`
		Body       string `json:"body"`
		LateNight  bool   `json:"late_night_only"`
		UnlockedAt string `json:"unlocked_at"`
	}
	out := make([]storyDTO, 0, len(rows))
	for _, r := range rows {
		if r.Story == nil {
			continue
		}
		out = append(out, storyDTO{
			Code: r.Story.Code, Title: r.Story.Title, Body: r.Story.Body,
			LateNight: r.Story.LateNightOnly, UnlockedAt: r.UnlockedAt.Format(time.RFC3339),
		})
	}
	return c.JSON(http.StatusOK, out)
}

// isLateNight uses SERVER time (Asia/Bangkok) — 22:00-02:00.
func isLateNight(t time.Time) bool {
	h := t.Hour()
	return h >= 22 || h < 2
}

// maybeTellStory rolls a chance that the AutoServeBot shares a story with
// the ordering player (Phase 2 §5). Late-night stories only after 22:00.
func (s *Server) maybeTellStory(playerID string) {
	if rand.Float64() > 0.35 {
		return
	}
	stories, err := s.Social.ListStories()
	if err != nil || len(stories) == 0 {
		return
	}
	now := time.Now()
	eligible := make([]models.BartenderStory, 0, len(stories))
	for _, st := range stories {
		if st.LateNightOnly && !isLateNight(now) {
			continue
		}
		eligible = append(eligible, st)
	}
	if len(eligible) == 0 {
		return
	}
	pick := eligible[rand.Intn(len(eligible))]
	fresh, err := s.Social.UnlockStory(playerID, pick.ID)
	if err != nil || !fresh {
		return
	}
	s.Hub.SendTo(playerID, map[string]any{
		"type": "bartender_story", "title": pick.Title, "body": pick.Body,
	})
}

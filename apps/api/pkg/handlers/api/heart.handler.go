package api

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"

	dheart "neongather/pkg/domain/heart"
	dwallet "neongather/pkg/domain/wallet"
	"neongather/pkg/logger"
	"neongather/pkg/models"
)

// Heart system endpoints (Phase 2 §6). Iron rules recap:
// hearts bind to StaffNPC ONLY (FK-enforced), points are server-computed,
// no real-money conversion exists, every DTO carries is_npc so the UI can
// never confuse a story character with a real player.

type npcDTO struct {
	ID            string  `json:"id"`
	IsNPC         bool    `json:"is_npc"` // ALWAYS true — explicit badge flag
	Name          string  `json:"name"`
	Bio           string  `json:"bio"`
	ArtistCredit  string  `json:"artist_credit"`
	SignatureMenu string  `json:"signature_menu"`
	ShiftStart    int     `json:"shift_start_hour"`
	ShiftEnd      int     `json:"shift_end_hour"`
	OnShift       bool    `json:"on_shift"`
	HeartPoints   int     `json:"heart_points"`
	HeartLevel    int     `json:"heart_level"`
	NextLevelAt   int     `json:"next_level_at"`
	TalkedToday   bool    `json:"talked_today"`
}

func (s *Server) npcToDTO(n models.StaffNPC, uid string, now time.Time) npcDTO {
	dto := npcDTO{
		ID: n.ID, IsNPC: true, Name: n.Name, Bio: n.Bio, ArtistCredit: n.ArtistCredit,
		SignatureMenu: n.SignatureMenu, ShiftStart: n.ShiftStartHour, ShiftEnd: n.ShiftEndHour,
		OnShift: dheart.OnShift(n.ShiftStartHour, n.ShiftEndHour, now.Hour()),
	}
	if aff, err := s.Hearts.FindAffinity(uid, n.ID); err == nil {
		dto.HeartPoints = aff.HeartPoints
		dto.HeartLevel = aff.HeartLevel
		if aff.LastTalkedAt != nil {
			dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
			dto.TalkedToday = aff.LastTalkedAt.After(dayStart)
		}
	}
	if dto.HeartLevel < dheart.MaxLevel {
		dto.NextLevelAt = dheart.PointsForLevel(dto.HeartLevel + 1)
	}
	return dto
}

func (s *Server) ListNPCs(c echo.Context) error {
	npcs, err := s.Hearts.ListActiveNPCs()
	if err != nil {
		return errJSON(c, http.StatusInternalServerError, "could not list characters")
	}
	uid := userID(c)
	now := time.Now()
	out := make([]npcDTO, 0, len(npcs))
	for _, n := range npcs {
		out = append(out, s.npcToDTO(n, uid, now))
	}
	return c.JSON(http.StatusOK, out)
}

func (s *Server) GetNPC(c echo.Context) error {
	n, err := s.Hearts.FindNPC(c.Param("id"))
	if err != nil {
		return errJSON(c, http.StatusNotFound, "character not found")
	}
	uid := userID(c)
	now := time.Now()
	dto := s.npcToDTO(*n, uid, now)

	nodes, _ := s.Hearts.ListStoryNodes(n.ID)
	type nodeDTO struct {
		RequiredLevel int    `json:"required_level"`
		Title         string `json:"title"`
		StoryText     string `json:"story_text,omitempty"` // only when unlocked
		RewardType    string `json:"reward_type"`
		Unlocked      bool   `json:"unlocked"`
	}
	track := make([]nodeDTO, 0, len(nodes))
	for _, nd := range nodes {
		item := nodeDTO{RequiredLevel: nd.RequiredLevel, Title: nd.Title, RewardType: nd.RewardType}
		if dto.HeartLevel >= nd.RequiredLevel {
			item.Unlocked = true
			item.StoryText = nd.StoryText
		}
		track = append(track, item)
	}
	prefs, _ := s.Hearts.ListGiftPrefs(n.ID)
	type prefDTO struct {
		ItemName   string `json:"item_name"`
		Preference string `json:"preference"`
	}
	prefOut := make([]prefDTO, 0, len(prefs))
	for _, p := range prefs {
		prefOut = append(prefOut, prefDTO{ItemName: p.ItemName, Preference: p.Preference})
	}
	return c.JSON(http.StatusOK, map[string]any{
		"npc": dto, "story_track": track, "gift_prefs": prefOut,
	})
}

// awardHearts adds points, then applies any newly-crossed story-node reward
// side effects (Lv3 character coaster, Lv5 secret recipe). WS-notifies.
func (s *Server) awardHearts(playerID, staffID string, points int, reason string) (*models.PlayerAffinity, error) {
	var row *models.PlayerAffinity
	var levelled bool
	err := s.DB.Transaction(func(tx *gorm.DB) error {
		r, up, e := s.Hearts.AddHearts(tx, playerID, staffID, points)
		row, levelled = r, up
		return e
	})
	if err != nil {
		return nil, err
	}
	if levelled {
		s.applyStoryRewards(playerID, staffID, row.HeartLevel)
		s.Hub.SendTo(playerID, map[string]any{
			"type": "heart_level_up", "staff_id": staffID, "level": row.HeartLevel,
		})
	}
	logger.Log.WithField("reason", reason).Debug("hearts awarded")
	return row, nil
}

func (s *Server) applyStoryRewards(playerID, staffID string, level int) {
	n, err := s.Hearts.FindNPC(staffID)
	if err != nil {
		return
	}
	nodes, err := s.Hearts.ListStoryNodes(staffID)
	if err != nil {
		return
	}
	for _, nd := range nodes {
		if nd.RequiredLevel != level {
			continue
		}
		switch nd.RewardType {
		case "COASTER":
			if n.HomeShopID != nil {
				_ = s.DB.Transaction(func(tx *gorm.DB) error {
					co, e := s.Coasters.EnsureCoaster(tx, *n.HomeShopID, models.CoasterSeasonal, "CHAR-"+strings.ToUpper(n.Name))
					if e != nil {
						return e
					}
					_, e = s.Coasters.Grant(tx, playerID, co.ID, 0)
					return e
				})
			}
		case "RECIPE":
			it := &models.Item{Name: nd.RewardRef, Category: models.CategoryDrink, Price: 60, OwnerID: playerID}
			_ = s.Items.Create(it)
		}
		s.Hub.SendTo(playerID, map[string]any{
			"type": "heart_story", "staff_name": n.Name,
			"title": nd.Title, "story_text": nd.StoryText,
		})
	}
}

func (s *Server) npcOnShiftOr400(c echo.Context) (*models.StaffNPC, error) {
	n, err := s.Hearts.FindNPC(c.Param("id"))
	if err != nil {
		return nil, errJSON(c, http.StatusNotFound, "character not found")
	}
	if !dheart.OnShift(n.ShiftStartHour, n.ShiftEndHour, time.Now().Hour()) {
		return nil, errJSON(c, http.StatusBadRequest, n.Name+" is off shift right now")
	}
	return n, nil
}

// TalkToNPC: one friendly chat per server-local day (guard lives in SQL).
func (s *Server) TalkToNPC(c echo.Context) error {
	uid := userID(c)
	n, herr := s.npcOnShiftOr400(c)
	if n == nil {
		return herr
	}
	now := time.Now()
	var talked bool
	err := s.DB.Transaction(func(tx *gorm.DB) error {
		row, _, e := s.Hearts.AddHearts(tx, uid, n.ID, 0) // ensure the row exists
		if e != nil {
			return e
		}
		cnt, e := s.Hearts.TouchTalked(tx, row.ID, now)
		if e != nil {
			return e
		}
		talked = cnt > 0
		return nil
	})
	if err != nil {
		return errJSON(c, http.StatusInternalServerError, "talk failed")
	}
	if !talked {
		return errJSON(c, http.StatusBadRequest, "you already talked today — come back tomorrow!")
	}
	row, err := s.awardHearts(uid, n.ID, dheart.PointsDailyTalk, "daily talk")
	if err != nil {
		return errJSON(c, http.StatusInternalServerError, "talk failed")
	}
	return c.JSON(http.StatusOK, map[string]any{
		"line":         n.Name + " smiles: \"Good to see you again. The usual?\"",
		"heart_points": row.HeartPoints, "heart_level": row.HeartLevel,
	})
}

type npcTipReq struct {
	Amount int `json:"amount" validate:"required,min=1,max=1000"`
}

// TipNPC: in-game coins only (sink). Real-money conversion does not exist
// anywhere in this API (iron rule b — verified by a route-table test).
func (s *Server) TipNPC(c echo.Context) error {
	uid := userID(c)
	n, herr := s.npcOnShiftOr400(c)
	if n == nil {
		return herr
	}
	var body npcTipReq
	if err := c.Bind(&body); err != nil {
		return errJSON(c, http.StatusBadRequest, "invalid body")
	}
	if err := c.Validate(&body); err != nil {
		return errJSON(c, http.StatusUnprocessableEntity, err.Error())
	}
	err := s.DB.Transaction(func(tx *gorm.DB) error {
		_, e := s.Wallet.ApplyDelta(tx, uid, -body.Amount, models.LedgerTipPay, n.ID, "tip "+n.Name)
		return e
	})
	if err != nil {
		if errors.Is(err, dwallet.ErrInsufficientFunds) {
			return errJSON(c, http.StatusBadRequest, "insufficient funds")
		}
		return errJSON(c, http.StatusInternalServerError, "tip failed")
	}
	row, err := s.awardHearts(uid, n.ID, dheart.PointsTip, "tip")
	if err != nil {
		return errJSON(c, http.StatusInternalServerError, "tip failed")
	}
	return c.JSON(http.StatusOK, map[string]any{
		"line":         n.Name + " laughs: \"You really don't have to — but thank you!\"",
		"heart_points": row.HeartPoints, "heart_level": row.HeartLevel,
	})
}

type npcGiftReq struct {
	ItemID string `json:"item_id" validate:"required"`
}

// GiftToNPC consumes an owned item; hearts scale with the character's own
// taste (gifts must come from the player economy — never bought with real
// money).
func (s *Server) GiftToNPC(c echo.Context) error {
	uid := userID(c)
	n, herr := s.npcOnShiftOr400(c)
	if n == nil {
		return herr
	}
	var body npcGiftReq
	if err := c.Bind(&body); err != nil {
		return errJSON(c, http.StatusBadRequest, "invalid body")
	}
	if err := c.Validate(&body); err != nil {
		return errJSON(c, http.StatusUnprocessableEntity, err.Error())
	}
	it, err := s.Items.FindByID(body.ItemID)
	if err != nil || it.OwnerID != uid {
		return errJSON(c, http.StatusNotFound, "item not found in your inventory")
	}
	pref := models.GiftNeutral
	prefs, _ := s.Hearts.ListGiftPrefs(n.ID)
	for _, p := range prefs {
		if strings.EqualFold(p.ItemName, it.Name) {
			pref = p.Preference
			break
		}
	}
	err = s.DB.Transaction(func(tx *gorm.DB) error {
		cnt, e := s.Items.DeleteOwned(tx, it.ID, uid)
		if e != nil {
			return e
		}
		if cnt == 0 {
			return errItemUnavailable
		}
		return nil
	})
	if err != nil {
		return errJSON(c, http.StatusBadRequest, "item no longer available")
	}
	row, err := s.awardHearts(uid, n.ID, dheart.PointsForGift(pref), "gift "+it.Name)
	if err != nil {
		return errJSON(c, http.StatusInternalServerError, "gift failed")
	}
	line := map[string]string{
		models.GiftLoved:    n.Name + "'s eyes light up: \"No way — this is my favourite!\"",
		models.GiftLiked:    n.Name + " grins: \"Oh nice, thank you!\"",
		models.GiftNeutral:  n.Name + " nods warmly: \"That's thoughtful of you.\"",
		models.GiftDisliked: n.Name + " smiles politely: \"...I'll find it a good home.\"",
	}[pref]
	return c.JSON(http.StatusOK, map[string]any{
		"line": line, "preference": pref,
		"heart_points": row.HeartPoints, "heart_level": row.HeartLevel,
	})
}

// grantSignatureHearts: ordering the character's signature menu during
// shift warms them up a little (called from OrderTable).
func (s *Server) grantSignatureHearts(playerID, orderName string) {
	npcs, err := s.Hearts.ListActiveNPCs()
	if err != nil {
		return
	}
	now := time.Now()
	for _, n := range npcs {
		if !strings.EqualFold(n.SignatureMenu, orderName) {
			continue
		}
		if !dheart.OnShift(n.ShiftStartHour, n.ShiftEndHour, now.Hour()) {
			continue
		}
		_, _ = s.awardHearts(playerID, n.ID, dheart.PointsSignatureOrder, "signature order")
	}
}

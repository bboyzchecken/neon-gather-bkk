package api

import (
	"errors"
	"net/http"
	"time"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"

	"neongather/pkg/domain/questperiod"
	"neongather/pkg/models"
)

type questDTO struct {
	ID          string  `json:"id"`
	Code        string  `json:"code"`
	Type        string  `json:"type"`
	Title       string  `json:"title"`
	Description string  `json:"description"`
	JobType     *string `json:"job_type"`
	Event       string  `json:"event"`
	Target      int     `json:"target"`
	RewardCoins int     `json:"reward_coins"`
	RewardJobXP int     `json:"reward_job_xp"`
	PeriodKey   string  `json:"period_key"`
	Progress    int     `json:"progress"`
	Status      string  `json:"status"`
	// CommunityProgress carries the server-wide total for COMMUNITY quests.
	CommunityProgress *int `json:"community_progress,omitempty"`
}

// ListQuests merges active quest definitions with the caller's progress in
// each quest's CURRENT period.
func (s *Server) ListQuests(c echo.Context) error {
	uid := userID(c)
	quests, err := s.Quests.ListActive()
	if err != nil {
		return errJSON(c, http.StatusInternalServerError, "could not list quests")
	}
	mine, err := s.Quests.ListPlayer(uid)
	if err != nil {
		return errJSON(c, http.StatusInternalServerError, "could not list quest progress")
	}
	type key struct{ questID, period string }
	prog := map[key]models.PlayerQuest{}
	for _, pq := range mine {
		prog[key{pq.QuestID, pq.PeriodKey}] = pq
	}

	now := time.Now()
	out := make([]questDTO, 0, len(quests))
	for _, q := range quests {
		period := questperiod.KeyFor(q.Type, now)
		dto := questDTO{
			ID: q.ID, Code: q.Code, Type: q.Type, Title: q.Title,
			Description: q.Description, JobType: q.JobType, Event: q.Event,
			Target: q.Target, RewardCoins: q.RewardCoins, RewardJobXP: q.RewardJobXP,
			PeriodKey: period, Status: models.PQActive,
		}
		if pq, ok := prog[key{q.ID, period}]; ok {
			dto.Progress = pq.Progress
			dto.Status = pq.Status
		}
		if q.Type == models.QuestCommunity {
			total := 0
			if cp, err := s.Quests.FindCommunity(q.ID, period); err == nil {
				total = cp.Progress
			}
			dto.CommunityProgress = &total
		}
		out = append(out, dto)
	}
	return c.JSON(http.StatusOK, out)
}

// ClaimQuest pays out a COMPLETED quest (guarded flip, rewards server-side).
func (s *Server) ClaimQuest(c echo.Context) error {
	uid := userID(c)
	q, err := s.Quests.FindByID(c.Param("id"))
	if err != nil {
		return errJSON(c, http.StatusNotFound, "quest not found")
	}
	period := questperiod.KeyFor(q.Type, time.Now())

	// Community quests: claimable once the server-wide goal is met and the
	// player contributed at least once this period.
	if q.Type == models.QuestCommunity {
		cp, err := s.Quests.FindCommunity(q.ID, period)
		if err != nil || cp.Progress < q.Target {
			return errJSON(c, http.StatusBadRequest, "community goal not reached yet")
		}
		pq, err := s.Quests.FindPlayerQuest(uid, q.ID, period)
		if err != nil || pq.Progress < 1 {
			return errJSON(c, http.StatusBadRequest, "you have not contributed this period")
		}
		if pq.Status == models.PQClaimed {
			return errJSON(c, http.StatusBadRequest, "already claimed")
		}
		// personal row may still be ACTIVE (personal target != community);
		// promote it to COMPLETED so the guarded claim below can flip it.
		if pq.Status == models.PQActive {
			now := time.Now()
			if err := s.DB.Model(&models.PlayerQuest{}).
				Where("id = ? AND status = ?", pq.ID, models.PQActive).
				Updates(map[string]any{"status": models.PQCompleted, "completed_at": now}).Error; err != nil {
				return errJSON(c, http.StatusInternalServerError, "claim failed")
			}
		}
	}

	var balance int
	err = s.DB.Transaction(func(tx *gorm.DB) error {
		n, e := s.Quests.Claim(tx, uid, q.ID, period)
		if e != nil {
			return e
		}
		if n == 0 {
			return errQuestNotClaimable
		}
		if q.RewardCoins > 0 {
			b, e := s.Wallet.ApplyDelta(tx, uid, q.RewardCoins, models.LedgerQuestReward, q.ID, "quest "+q.Code)
			if e != nil {
				return e
			}
			balance = b
		}
		if q.RewardJobXP > 0 && q.JobType != nil {
			if _, _, e := s.Jobs.AddXP(tx, uid, *q.JobType, q.RewardJobXP); e != nil {
				return e
			}
		}
		return nil
	})
	if err != nil {
		if errors.Is(err, errQuestNotClaimable) {
			return errJSON(c, http.StatusBadRequest, "quest is not claimable")
		}
		return errJSON(c, http.StatusInternalServerError, "claim failed")
	}
	return c.JSON(http.StatusOK, map[string]any{
		"claimed": true, "reward_coins": q.RewardCoins, "balance": balance,
	})
}

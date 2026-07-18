// Package progress is the single server-side entry point for "something
// happened" events: it awards job XP, advances quests (personal + community)
// and pushes realtime notifications. Handlers/bots fire events; nothing about
// XP or quest progress ever comes from the client (iron rule §9).
package progress

import (
	"time"

	"gorm.io/gorm"

	"neongather/pkg/domain/progression"
	"neongather/pkg/domain/questperiod"
	"neongather/pkg/logger"
	"neongather/pkg/models"
	"neongather/pkg/ws"
)

type Service struct {
	db     *gorm.DB
	jobs   models.JobStore
	quests models.QuestStore
	hub    *ws.Hub
}

func New(db *gorm.DB, jobs models.JobStore, quests models.QuestStore, hub *ws.Hub) *Service {
	return &Service{db: db, jobs: jobs, quests: quests, hub: hub}
}

// Fire records one occurrence of a progress event for a player. Runs in its
// own transaction; failures are logged but never break the calling flow (the
// economy action already committed).
func (s *Service) Fire(playerID, event string) {
	if playerID == "" {
		return
	}
	type levelUp struct {
		job   string
		level int
	}
	var ups []levelUp
	var completed []models.Quest

	err := s.db.Transaction(func(tx *gorm.DB) error {
		// 1. job XP (with the job's own xp-bonus perk applied)
		for _, award := range progression.AwardsFor(event) {
			xp := award.XP
			if row, err := s.jobs.Find(playerID, award.Job); err == nil {
				bp := progression.EffectValue(award.Job, row.Level, "job_xp_bonus_bp")
				xp = progression.ApplyBonusBP(xp, bp)
			}
			row, leveled, err := s.jobs.AddXP(tx, playerID, award.Job, xp)
			if err != nil {
				return err
			}
			if leveled {
				ups = append(ups, levelUp{job: award.Job, level: row.Level})
			}
		}

		// 2. quests keyed on this event
		quests, err := s.quests.ListActive()
		if err != nil {
			return err
		}
		now := time.Now()
		for i := range quests {
			q := quests[i]
			if q.Event != event {
				continue
			}
			period := questperiod.KeyFor(q.Type, now)
			if q.Type == models.QuestCommunity {
				if _, err := s.quests.AddCommunity(tx, q.ID, period, 1); err != nil {
					return err
				}
				// personal contribution also tracked (claim eligibility)
				if _, err := s.quests.Advance(tx, playerID, &q, period, 1); err != nil {
					return err
				}
				continue
			}
			row, err := s.quests.Advance(tx, playerID, &q, period, 1)
			if err != nil {
				return err
			}
			if row.Status == models.PQCompleted && row.CompletedAt != nil &&
				now.Sub(*row.CompletedAt) < time.Second {
				completed = append(completed, q)
			}
		}
		return nil
	})
	if err != nil {
		logger.Log.WithError(err).WithField("event", event).Warn("progress event failed")
		return
	}

	// 3. realtime feedback (after commit)
	for _, up := range ups {
		s.hub.SendTo(playerID, map[string]any{
			"type": "job_level_up", "job_type": up.job, "level": up.level,
		})
	}
	for _, q := range completed {
		s.hub.SendTo(playerID, map[string]any{
			"type": "quest_completed", "quest_id": q.ID, "code": q.Code, "title": q.Title,
		})
	}
}

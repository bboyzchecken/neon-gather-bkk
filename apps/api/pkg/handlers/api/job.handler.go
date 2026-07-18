package api

import (
	"net/http"

	"github.com/labstack/echo/v4"

	"neongather/pkg/domain/progression"
	"neongather/pkg/models"
)

type playerJobDTO struct {
	JobType       string             `json:"job_type"`
	XP            int                `json:"xp"`
	Level         int                `json:"level"`
	XPForNext     int                `json:"xp_for_next"` // cumulative XP needed for the next level (0 at cap)
	UnlockedPerks []progression.Perk `json:"unlocked_perks"`
}

func toPlayerJobDTO(jobType string, xp, level int) playerJobDTO {
	next := 0
	if level < progression.MaxLevel {
		next = progression.XPForLevel(level + 1)
	}
	perks := progression.UnlockedPerks(jobType, level)
	if perks == nil {
		perks = []progression.Perk{}
	}
	return playerJobDTO{JobType: jobType, XP: xp, Level: level, XPForNext: next, UnlockedPerks: perks}
}

// MyJobs returns every job with the player's progress (level 1 / 0 XP rows
// are synthesized for jobs not started yet, so the UI always shows all five).
func (s *Server) MyJobs(c echo.Context) error {
	rows, err := s.Jobs.ListByPlayer(userID(c))
	if err != nil {
		return errJSON(c, http.StatusInternalServerError, "could not list jobs")
	}
	byType := map[string]models.PlayerJob{}
	for _, r := range rows {
		byType[r.JobType] = r
	}
	out := make([]playerJobDTO, 0, len(progression.Jobs()))
	for _, jt := range progression.Jobs() {
		if r, ok := byType[jt]; ok {
			out = append(out, toPlayerJobDTO(jt, r.XP, r.Level))
		} else {
			out = append(out, toPlayerJobDTO(jt, 0, 1))
		}
	}
	return c.JSON(http.StatusOK, out)
}

// JobTree returns the static skill tree for all jobs.
func (s *Server) JobTree(c echo.Context) error {
	out := map[string][]progression.Perk{}
	for _, jt := range progression.Jobs() {
		out[jt] = progression.Tree(jt)
	}
	return c.JSON(http.StatusOK, out)
}

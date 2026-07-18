package api

import (
	"net/http"

	"github.com/labstack/echo/v4"
)

func (s *Server) EarningsLeaderboard(c echo.Context) error {
	entries, err := s.Leaderboard.TopEarnings(c.Request().Context(), 10)
	if err != nil {
		return errJSON(c, http.StatusInternalServerError, "leaderboard error")
	}
	return c.JSON(http.StatusOK, entries)
}

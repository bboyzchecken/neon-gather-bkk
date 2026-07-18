package api

import (
	"net/http"

	"github.com/labstack/echo/v4"
)

func (s *Server) GetMe(c echo.Context) error {
	u, err := s.Users.FindByID(userID(c))
	if err != nil {
		return errJSON(c, http.StatusNotFound, "user not found")
	}
	return c.JSON(http.StatusOK, u)
}

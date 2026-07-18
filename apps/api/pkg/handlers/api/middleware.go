package api

import (
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"
	"neongather/pkg/handlers/api/request"
)

// JwtMiddleware requires a valid access token and sets user context.
func (s *Server) JwtMiddleware() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			tok := bearer(c)
			if tok == "" {
				return errJSON(c, http.StatusUnauthorized, "unauthorized")
			}
			claims, err := request.ParseJWT(s.Config.JwtSecret, tok)
			if err != nil {
				return errJSON(c, http.StatusUnauthorized, "unauthorized")
			}
			c.Set("user_id", claims.UserID)
			c.Set("role", claims.Role)
			c.Set("is_guest", claims.IsGuest)
			return next(c)
		}
	}
}

func bearer(c echo.Context) string {
	h := c.Request().Header.Get("Authorization")
	if strings.HasPrefix(h, "Bearer ") {
		return strings.TrimPrefix(h, "Bearer ")
	}
	return ""
}

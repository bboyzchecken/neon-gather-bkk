package api

import (
	"net/http"

	"github.com/gorilla/websocket"
	"github.com/labstack/echo/v4"

	"neongather/pkg/handlers/api/request"
	"neongather/pkg/view"
	"neongather/pkg/ws"
)

// Dev-only origin check; tighten for production.
var upgrader = websocket.Upgrader{
	CheckOrigin: func(_ *http.Request) bool { return true },
}

// HandleWS upgrades to a WebSocket. Auth is via ?token= because browsers can't
// set Authorization headers on the WS handshake.
func (s *Server) HandleWS(c echo.Context) error {
	tok := c.QueryParam("token")
	if tok == "" {
		return errJSON(c, http.StatusUnauthorized, "missing token")
	}
	claims, err := request.ParseJWT(s.Config.JwtSecret, tok)
	if err != nil {
		return errJSON(c, http.StatusUnauthorized, "invalid token")
	}
	u, err := s.Users.FindByID(claims.UserID)
	if err != nil {
		return errJSON(c, http.StatusUnauthorized, "unknown user")
	}

	conn, err := upgrader.Upgrade(c.Response(), c.Request(), nil)
	if err != nil {
		return err
	}

	tables, _ := s.Tables.List()
	client := ws.NewClient(s.Hub, conn, u.ID, u.DisplayName)
	client.Start(view.Tables(tables)) // blocks until the socket closes
	return nil
}

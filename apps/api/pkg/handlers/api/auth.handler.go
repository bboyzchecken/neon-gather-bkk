package api

import (
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"neongather/pkg/handlers/api/request"
	"neongather/pkg/models"
	"neongather/pkg/utils/hashutil"
)

type authResponse struct {
	AccessToken  string       `json:"access_token"`
	RefreshToken string       `json:"refresh_token"`
	User         *models.User `json:"user"`
}

func (s *Server) issueTokens(u *models.User) (*authResponse, error) {
	access, err := request.GenerateJWT(s.Config.JwtSecret, u.ID, u.Role, u.IsGuest, s.Config.JwtTTLHours)
	if err != nil {
		return nil, err
	}
	refresh := request.RandomToken()
	rt := &models.RefreshToken{
		UserID:    u.ID,
		TokenHash: hashutil.SHA256(refresh),
		ExpiresAt: time.Now().AddDate(0, 0, 30),
	}
	if err := s.Tokens.Create(rt); err != nil {
		return nil, err
	}
	return &authResponse{AccessToken: access, RefreshToken: refresh, User: u}, nil
}

type registerReq struct {
	Email       string `json:"email" validate:"required,email"`
	Password    string `json:"password" validate:"required,min=6,max=72"`
	DisplayName string `json:"display_name" validate:"required,min=2,max=24"`
}

func (s *Server) Register(c echo.Context) error {
	var body registerReq
	if err := c.Bind(&body); err != nil {
		return errJSON(c, http.StatusBadRequest, "invalid body")
	}
	if err := c.Validate(&body); err != nil {
		return errJSON(c, http.StatusUnprocessableEntity, err.Error())
	}
	if _, err := s.Users.FindByEmail(body.Email); err == nil {
		return errJSON(c, http.StatusBadRequest, "email already registered")
	}
	hash, err := request.HashPassword(body.Password)
	if err != nil {
		return errJSON(c, http.StatusInternalServerError, "hash failed")
	}
	email := body.Email
	u := &models.User{Email: &email, Password: hash, DisplayName: body.DisplayName, Role: models.RolePlayer}
	if err := s.Users.Create(u); err != nil {
		return errJSON(c, http.StatusInternalServerError, "could not create user")
	}
	if _, err := s.Wallet.Credit(u.ID, models.LedgerSignupBonus, s.Config.SignupBonus, "signup bonus"); err != nil {
		return errJSON(c, http.StatusInternalServerError, "bonus failed")
	}
	if fresh, err := s.Users.FindByID(u.ID); err == nil {
		u = fresh
	}
	res, err := s.issueTokens(u)
	if err != nil {
		return errJSON(c, http.StatusInternalServerError, "token failed")
	}
	return c.JSON(http.StatusCreated, res)
}

type loginReq struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required"`
}

func (s *Server) Login(c echo.Context) error {
	var body loginReq
	if err := c.Bind(&body); err != nil {
		return errJSON(c, http.StatusBadRequest, "invalid body")
	}
	if err := c.Validate(&body); err != nil {
		return errJSON(c, http.StatusUnprocessableEntity, err.Error())
	}
	u, err := s.Users.FindByEmail(body.Email)
	if err != nil || u.Password == "" || !request.CheckPassword(u.Password, body.Password) {
		return errJSON(c, http.StatusUnauthorized, "invalid credentials")
	}
	res, err := s.issueTokens(u)
	if err != nil {
		return errJSON(c, http.StatusInternalServerError, "token failed")
	}
	return c.JSON(http.StatusOK, res)
}

func (s *Server) Guest(c echo.Context) error {
	u := &models.User{
		DisplayName: "Guest-" + uuid.NewString()[:4],
		Role:        models.RoleGuest,
		IsGuest:     true,
	}
	if err := s.Users.Create(u); err != nil {
		return errJSON(c, http.StatusInternalServerError, "could not create guest")
	}
	if _, err := s.Wallet.Credit(u.ID, models.LedgerGuestBonus, s.Config.GuestBonus, "guest bonus"); err != nil {
		return errJSON(c, http.StatusInternalServerError, "bonus failed")
	}
	if fresh, err := s.Users.FindByID(u.ID); err == nil {
		u = fresh
	}
	res, err := s.issueTokens(u)
	if err != nil {
		return errJSON(c, http.StatusInternalServerError, "token failed")
	}
	return c.JSON(http.StatusOK, res)
}

type refreshReq struct {
	RefreshToken string `json:"refresh_token" validate:"required"`
}

func (s *Server) Refresh(c echo.Context) error {
	var body refreshReq
	if err := c.Bind(&body); err != nil {
		return errJSON(c, http.StatusBadRequest, "invalid body")
	}
	if err := c.Validate(&body); err != nil {
		return errJSON(c, http.StatusUnprocessableEntity, err.Error())
	}
	rt, err := s.Tokens.FindByHash(hashutil.SHA256(body.RefreshToken))
	if err != nil || rt.Revoked || rt.ExpiresAt.Before(time.Now()) {
		return errJSON(c, http.StatusUnauthorized, "invalid refresh token")
	}
	rt.Revoked = true
	_ = s.Tokens.Update(rt)
	u, err := s.Users.FindByID(rt.UserID)
	if err != nil {
		return errJSON(c, http.StatusUnauthorized, "invalid refresh token")
	}
	res, err := s.issueTokens(u)
	if err != nil {
		return errJSON(c, http.StatusInternalServerError, "token failed")
	}
	return c.JSON(http.StatusOK, res)
}

func (s *Server) Logout(c echo.Context) error {
	var body struct {
		RefreshToken string `json:"refresh_token"`
	}
	_ = c.Bind(&body)
	if body.RefreshToken != "" {
		_ = s.Tokens.RevokeByHashUser(hashutil.SHA256(body.RefreshToken), userID(c))
	}
	return c.JSON(http.StatusOK, map[string]bool{"ok": true})
}

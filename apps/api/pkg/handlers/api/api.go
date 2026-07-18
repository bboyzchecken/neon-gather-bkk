package api

import (
	"context"
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"github.com/redis/go-redis/v9"
	"go.uber.org/fx"
	"gorm.io/gorm"

	"neongather/pkg/core"
	"neongather/pkg/logger"
	"neongather/pkg/models"
	"neongather/pkg/services/autoserve"
	"neongather/pkg/services/leaderboard"
	"neongather/pkg/services/moderation"
	"neongather/pkg/services/storage"
	"neongather/pkg/utils/validatorutil"
	"neongather/pkg/ws"
)

type Server struct {
	Config      core.Config
	DB          *gorm.DB
	Redis       *redis.Client
	Users       models.UserStore
	Tokens      models.RefreshTokenStore
	Wallet      models.WalletStore
	Plots       models.PlotStore
	Items       models.ItemStore
	Tables      models.TableStore
	Storage     *storage.Service
	Moderation  *moderation.Service
	Leaderboard *leaderboard.Service
	Hub         *ws.Hub

	e *echo.Echo
}

// ServerParams collects all fx-provided dependencies.
type ServerParams struct {
	fx.In

	Config      core.Config
	DB          *gorm.DB
	Redis       *redis.Client
	Users       models.UserStore
	Tokens      models.RefreshTokenStore
	Wallet      models.WalletStore
	Plots       models.PlotStore
	Items       models.ItemStore
	Tables      models.TableStore
	Storage     *storage.Service
	Moderation  *moderation.Service
	Leaderboard *leaderboard.Service
	Hub         *ws.Hub
	Bot         *autoserve.Bot // constructed so its lifecycle ticker starts
}

func NewServer(lc fx.Lifecycle, p ServerParams) *Server {
	s := &Server{
		Config: p.Config, DB: p.DB, Redis: p.Redis,
		Users: p.Users, Tokens: p.Tokens, Wallet: p.Wallet,
		Plots: p.Plots, Items: p.Items, Tables: p.Tables,
		Storage: p.Storage, Moderation: p.Moderation, Leaderboard: p.Leaderboard, Hub: p.Hub,
	}
	s.e = s.buildEcho()

	lc.Append(fx.Hook{
		OnStart: func(_ context.Context) error {
			go func() {
				addr := ":" + s.Config.APIPort
				if err := s.e.Start(addr); err != nil && err != http.ErrServerClosed {
					logger.Log.WithError(err).Error("echo stopped")
				}
			}()
			logger.Log.Infof("Neon Gather BKK API listening on :%s", s.Config.APIPort)
			return nil
		},
		OnStop: func(ctx context.Context) error {
			return s.e.Shutdown(ctx)
		},
	})
	return s
}

func (s *Server) buildEcho() *echo.Echo {
	e := echo.New()
	e.HideBanner = true
	e.HidePort = true
	e.Validator = validatorutil.New()

	e.Use(middleware.Recover())
	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins: s.Config.CORSOrigins,
		AllowMethods: []string{
			http.MethodGet, http.MethodPost, http.MethodPatch,
			http.MethodDelete, http.MethodOptions,
		},
		AllowHeaders: []string{echo.HeaderOrigin, echo.HeaderContentType, echo.HeaderAuthorization},
	}))
	e.Use(logger.Middleware())

	e.GET("/health", func(c echo.Context) error {
		return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
	})

	// Public auth routes
	a := e.Group("/auth")
	a.POST("/register", s.Register)
	a.POST("/login", s.Login)
	a.POST("/guest", s.Guest)
	a.POST("/refresh", s.Refresh)
	a.POST("/logout", s.Logout, s.JwtMiddleware())

	// Protected routes
	p := e.Group("", s.JwtMiddleware())
	p.GET("/users/me", s.GetMe)

	p.GET("/plots", s.ListPlots)
	p.POST("/plots/:id/rent", s.RentPlot)
	p.PATCH("/plots/:id/facade", s.SetFacade)
	p.POST("/plots/:id/facade/texture", s.UploadFacadeTexture)

	p.GET("/items/mine", s.MyItems)
	p.POST("/items", s.CreateItem)
	p.POST("/items/:id/vendor-sell", s.VendorSell)

	p.GET("/marketplace", s.BrowseMarket)
	p.POST("/marketplace/:id/list", s.ListForSale)
	p.POST("/marketplace/:id/unlist", s.Unlist)
	p.POST("/marketplace/:id/buy", s.Buy)

	p.GET("/tables", s.ListTables)
	p.POST("/tables/:id/order", s.OrderTable)
	p.POST("/tables/:id/collect", s.CollectTable)

	p.GET("/leaderboard/earnings", s.EarningsLeaderboard)

	// WebSocket (auth via ?token= — browsers can't set headers on the handshake)
	e.GET("/ws", s.HandleWS)

	return e
}

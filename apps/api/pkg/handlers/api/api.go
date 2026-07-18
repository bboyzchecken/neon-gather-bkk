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
	"neongather/pkg/services/progress"
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
	Jobs        models.JobStore
	Quests      models.QuestStore
	Staff       models.StaffStore
	Vending     models.VendingStore
	Photos      models.PhotoStore
	Storage     *storage.Service
	Moderation  *moderation.Service
	Leaderboard *leaderboard.Service
	Progress    *progress.Service
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
	Jobs        models.JobStore
	Quests      models.QuestStore
	Staff       models.StaffStore
	Vending     models.VendingStore
	Photos      models.PhotoStore
	Storage     *storage.Service
	Moderation  *moderation.Service
	Leaderboard *leaderboard.Service
	Progress    *progress.Service
	Hub         *ws.Hub
	Bot         *autoserve.Bot // constructed so its lifecycle ticker starts
}

func NewServer(lc fx.Lifecycle, p ServerParams) *Server {
	s := &Server{
		Config: p.Config, DB: p.DB, Redis: p.Redis,
		Users: p.Users, Tokens: p.Tokens, Wallet: p.Wallet,
		Plots: p.Plots, Items: p.Items, Tables: p.Tables,
		Jobs: p.Jobs, Quests: p.Quests, Staff: p.Staff,
		Vending: p.Vending, Photos: p.Photos,
		Storage: p.Storage, Moderation: p.Moderation, Leaderboard: p.Leaderboard,
		Progress: p.Progress, Hub: p.Hub,
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

	// Phase 1 — jobs & quests
	p.GET("/jobs/mine", s.MyJobs)
	p.GET("/jobs/tree", s.JobTree)
	p.GET("/quests", s.ListQuests)
	p.POST("/quests/:id/claim", s.ClaimQuest)

	// Phase 1 — job board (player staff; tips/reviews only, iron rule)
	p.GET("/staff/postings", s.ListPostings)
	p.POST("/staff/postings", s.CreatePosting)
	p.POST("/staff/postings/:id/close", s.ClosePosting)
	p.POST("/staff/postings/:id/apply", s.ApplyToPosting)
	p.GET("/staff/postings/:id/applications", s.ListApplications)
	p.GET("/staff/employments/mine", s.MyEmployments)
	p.POST("/staff/employments/:id/hire", s.HireStaff)
	p.POST("/staff/employments/:id/end", s.EndEmployment)
	p.POST("/staff/employments/:id/tip", s.TipStaff)
	p.POST("/staff/employments/:id/review", s.ReviewStaff)
	p.GET("/staff/:staff_id/reviews", s.StaffReviews)

	// Phase 1 — vending machines
	p.GET("/vending", s.ListVending)
	p.POST("/vending/slots/:slot_id/buy", s.BuyVending)
	p.POST("/vending/slots/:slot_id/restock", s.RestockVending)

	// Phase 1 — photo booth
	p.POST("/photos", s.UploadPhoto)
	p.GET("/photos/mine", s.MyPhotos)
	p.DELETE("/photos/:id", s.DeletePhoto)
	// public share endpoint (unguessable token, no auth)
	e.GET("/share/photos/:token", s.SharedPhoto)

	// WebSocket (auth via ?token= — browsers can't set headers on the handshake)
	e.GET("/ws", s.HandleWS)

	return e
}

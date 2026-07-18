package main

import (
	"os"
	"strings"
	"time"

	"github.com/joho/godotenv"
	"github.com/spf13/viper"
	"go.uber.org/fx"
	"gorm.io/gorm"

	"neongather/pkg/cache"
	"neongather/pkg/core"
	"neongather/pkg/db"
	handlers "neongather/pkg/handlers/api"
	"neongather/pkg/logger"
	"neongather/pkg/services/autoserve"
	"neongather/pkg/services/leaderboard"
	"neongather/pkg/services/moderation"
	"neongather/pkg/services/progress"
	"neongather/pkg/services/storage"
	itemstore "neongather/pkg/store/item"
	jobstore "neongather/pkg/store/job"
	photostore "neongather/pkg/store/photo"
	plotstore "neongather/pkg/store/plot"
	queststore "neongather/pkg/store/quest"
	staffstore "neongather/pkg/store/staff"
	tablestore "neongather/pkg/store/table"
	tokenstore "neongather/pkg/store/token"
	userstore "neongather/pkg/store/user"
	vendingstore "neongather/pkg/store/vending"
	walletstore "neongather/pkg/store/wallet"
	"neongather/pkg/ws"
)

func loadConfig() core.Config {
	_ = godotenv.Load(".env")
	_ = godotenv.Load("../../.env") // repo root when run from apps/api
	viper.AutomaticEnv()
	viper.SetDefault("ENV", "development")
	viper.SetDefault("API_PORT", "5000")
	viper.SetDefault("JWT_TTL_HOURS", 168)
	viper.SetDefault("SIGNUP_BONUS_COINS", 1000)
	viper.SetDefault("GUEST_BONUS_COINS", 250)

	if loc, err := time.LoadLocation("Asia/Bangkok"); err == nil {
		time.Local = loc
	}

	return core.Config{
		Environment: viper.GetString("ENV"),
		APIPort:     viper.GetString("API_PORT"),
		CORSOrigins: splitCSV(viper.GetString("CORS_ORIGINS")),
		JwtSecret:   viper.GetString("JWT_SECRET_KEY"),
		JwtTTLHours: viper.GetInt("JWT_TTL_HOURS"),
		SignupBonus: viper.GetInt("SIGNUP_BONUS_COINS"),
		GuestBonus:  viper.GetInt("GUEST_BONUS_COINS"),
		Postgres: core.PostgresConfig{
			Host:     viper.GetString("POSTGRES_HOST"),
			Port:     viper.GetString("POSTGRES_PORT"),
			Username: viper.GetString("POSTGRES_USER"),
			Password: viper.GetString("POSTGRES_PASSWORD"),
			Database: viper.GetString("POSTGRES_DB"),
		},
		Redis: core.RedisConfig{
			Host:     viper.GetString("REDIS_HOST"),
			Port:     viper.GetString("REDIS_PORT"),
			Password: viper.GetString("REDIS_PASSWORD"),
		},
		R2: core.R2Config{
			Endpoint:  viper.GetString("R2_ENDPOINT"),
			Region:    viper.GetString("R2_REGION"),
			AccessKey: viper.GetString("R2_ACCESS_KEY"),
			SecretKey: viper.GetString("R2_SECRET_KEY"),
			Bucket:    viper.GetString("R2_IMAGE_BUCKET"),
			PublicURL: viper.GetString("R2_PUBLIC_URL"),
		},
	}
}

func splitCSV(s string) []string {
	if s == "" {
		return []string{"http://localhost:3000", "http://localhost:5173"}
	}
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if t := strings.TrimSpace(p); t != "" {
			out = append(out, t)
		}
	}
	return out
}

func main() {
	cfg := loadConfig()
	logger.Init(cfg)

	cmd := ""
	if len(os.Args) > 1 {
		cmd = os.Args[1]
	}

	switch cmd {
	case "up":
		mustOpen(cfg)
		logger.Log.Info("migrations applied")
	case "seed":
		d := mustOpen(cfg)
		if err := Seed(d, cfg); err != nil {
			logger.Log.WithError(err).Fatal("seed failed")
		}
		logger.Log.Info("seed complete")
	default:
		runServer(cfg)
	}
}

func mustOpen(cfg core.Config) *gorm.DB {
	d, err := db.NewGorm(cfg)
	if err != nil {
		logger.Log.WithError(err).Fatal("db connect failed")
	}
	return d
}

func runServer(cfg core.Config) {
	app := fx.New(
		fx.Supply(cfg),
		fx.Provide(
			db.NewGorm,
			cache.New,
			ws.NewHub,
			userstore.New,
			tokenstore.New,
			walletstore.New,
			plotstore.New,
			itemstore.New,
			tablestore.New,
			jobstore.New,
			queststore.New,
			staffstore.New,
			vendingstore.New,
			photostore.New,
			storage.New,
			moderation.New,
			leaderboard.New,
			progress.New,
			autoserve.New,
			handlers.NewServer,
		),
		fx.Invoke(func(*handlers.Server) {}),
	)
	app.Run()
}

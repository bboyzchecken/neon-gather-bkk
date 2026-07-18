package db

import (
	"github.com/go-gormigrate/gormigrate/v2"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"neongather/pkg/core"
	"neongather/pkg/models"
)

// NewGorm opens the PostgreSQL connection and runs migrations. Provided to fx.
func NewGorm(cfg core.Config) (*gorm.DB, error) {
	gcfg := &gorm.Config{}
	if cfg.Environment != "production" {
		gcfg.Logger = logger.Default.LogMode(logger.Warn)
	}
	d, err := gorm.Open(postgres.Open(cfg.Postgres.DSN()), gcfg)
	if err != nil {
		return nil, err
	}
	if err := Migrate(d); err != nil {
		return nil, err
	}
	return d, nil
}

// Migrate applies schema migrations via gormigrate.
func Migrate(d *gorm.DB) error {
	m := gormigrate.New(d, gormigrate.DefaultOptions, []*gormigrate.Migration{
		{
			ID: "20260718_phase0_init",
			Migrate: func(tx *gorm.DB) error {
				return tx.AutoMigrate(
					&models.User{},
					&models.RefreshToken{},
					&models.LedgerEntry{},
					&models.Plot{},
					&models.Item{},
					&models.DiningTable{},
				)
			},
			Rollback: func(tx *gorm.DB) error {
				return tx.Migrator().DropTable(
					"dining_tables",
					"items",
					"plots",
					"ledger_entries",
					"refresh_tokens",
					"users",
				)
			},
		},
		{
			ID: "20260718_phase1_community",
			Migrate: func(tx *gorm.DB) error {
				return tx.AutoMigrate(
					&models.PlayerJob{},
					&models.Quest{},
					&models.PlayerQuest{},
					&models.CommunityProgress{},
					&models.JobPosting{},
					&models.Employment{},
					&models.StaffReview{},
					&models.VendingMachine{},
					&models.VendingSlot{},
					&models.Photo{},
				)
			},
			Rollback: func(tx *gorm.DB) error {
				return tx.Migrator().DropTable(
					"photos",
					"vending_slots",
					"vending_machines",
					"staff_reviews",
					"employments",
					"job_postings",
					"community_progresses",
					"player_quests",
					"quests",
					"player_jobs",
				)
			},
		},
		{
			ID: "20260718_phase2_coasters",
			Migrate: func(tx *gorm.DB) error {
				return tx.AutoMigrate(
					&models.Coaster{},
					&models.PlayerCoaster{},
				)
			},
			Rollback: func(tx *gorm.DB) error {
				return tx.Migrator().DropTable("player_coasters", "coasters")
			},
		},
		{
			ID: "20260719_phase2_social_trading",
			Migrate: func(tx *gorm.DB) error {
				return tx.AutoMigrate(
					&models.PlayerCoaster{}, // adds listed_for_sale + price
					&models.RegularStatus{},
					&models.CheersLog{},
				)
			},
			Rollback: func(tx *gorm.DB) error {
				return tx.Migrator().DropTable("cheers_logs", "regular_statuses")
			},
		},
	})
	return m.Migrate()
}

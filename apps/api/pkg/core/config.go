package core

import "fmt"

// Config is the single source of runtime configuration, populated from env
// vars via Viper in main.go.
type Config struct {
	Environment string
	APIPort     string
	CORSOrigins []string

	JwtSecret   string
	JwtTTLHours int

	SignupBonus int
	GuestBonus  int

	// Phase 2 — coaster collectibles
	CoasterSeason    string // current season tag stamped on issued coasters
	CoasterSeasonCap int    // max grants per shop per season (<=0 = unlimited)
	// Phase 2 — bar social
	RegularThreshold int // orders of the same menu at the same shop to become a regular
	GachaPrice       int // coins per gachapon spin (sink)

	Postgres PostgresConfig
	Redis    RedisConfig
	R2       R2Config
}

type PostgresConfig struct {
	Host     string
	Port     string
	Username string
	Password string
	Database string
}

// DSN builds the GORM PostgreSQL connection string.
func (p PostgresConfig) DSN() string {
	return fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable TimeZone=Asia/Bangkok",
		p.Host, p.Port, p.Username, p.Password, p.Database,
	)
}

type RedisConfig struct {
	Host     string
	Port     string
	Password string
}

func (r RedisConfig) Addr() string {
	return fmt.Sprintf("%s:%s", r.Host, r.Port)
}

// R2Config covers any S3-compatible store (MinIO in dev, Cloudflare R2 in prod).
type R2Config struct {
	Endpoint  string
	Region    string
	AccessKey string
	SecretKey string
	Bucket    string
	PublicURL string
}

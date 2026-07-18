package db

import (
	"fmt"
	"os"
	"testing"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	glogger "gorm.io/gorm/logger"

	"neongather/pkg/models"
)

// §7 iron-rule test (a): a PlayerAffinity row whose StaffID is a REAL
// player's user id must be rejected by the DATABASE (foreign key onto
// staff_npcs), not just by application code. Runs against the dev Postgres;
// skips when it isn't reachable (CI without infra).
func TestAffinityCannotTargetRealPlayers(t *testing.T) {
	host := envOr("POSTGRES_HOST", "localhost")
	port := envOr("POSTGRES_PORT", "5432")
	user := envOr("POSTGRES_USER", "neon")
	pass := envOr("POSTGRES_PASSWORD", "neon_dev_pw")
	name := envOr("POSTGRES_DB", "neon_gather")
	dsn := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable", host, port, user, pass, name)

	d, err := gorm.Open(postgres.Open(dsn), &gorm.Config{Logger: glogger.Default.LogMode(glogger.Silent)})
	if err != nil {
		t.Skipf("dev postgres not reachable (%v) — run `pnpm infra:up` to exercise this test", err)
	}
	if err := Migrate(d); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	// a real player account
	player := models.User{DisplayName: "iron-rule-probe", Role: models.RolePlayer}
	if err := d.Create(&player).Error; err != nil {
		t.Fatalf("create probe user: %v", err)
	}
	defer d.Delete(&player)

	// IRON RULE: pointing affinity at that player must FAIL at the DB layer
	bad := models.PlayerAffinity{PlayerID: player.ID, StaffID: player.ID}
	if err := d.Create(&bad).Error; err == nil {
		d.Delete(&bad)
		t.Fatal("DB accepted a PlayerAffinity targeting a real player — the staff_id FK onto staff_npcs is missing")
	}

	// sanity: a genuine StaffNPC target is accepted
	npc := models.StaffNPC{Name: "iron-rule-npc", IsActive: false}
	if err := d.Create(&npc).Error; err != nil {
		t.Fatalf("create probe npc: %v", err)
	}
	defer d.Delete(&npc)
	good := models.PlayerAffinity{PlayerID: player.ID, StaffID: npc.ID}
	if err := d.Create(&good).Error; err != nil {
		t.Fatalf("affinity to a real StaffNPC should be accepted, got: %v", err)
	}
	d.Delete(&good)
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

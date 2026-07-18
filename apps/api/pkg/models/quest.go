package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Quest is a static quest definition (seeded content).
// Objective: count `Target` occurrences of progress event `Event`.
type Quest struct {
	ID          string    `gorm:"primaryKey;size:36" json:"id"`
	Code        string    `gorm:"uniqueIndex;size:48;not null" json:"code"`
	Type        string    `gorm:"size:16;not null;index" json:"type"` // MAIN | JOB | DAILY | WEEKLY | COMMUNITY
	Title       string    `gorm:"size:96;not null" json:"title"`
	Description string    `gorm:"size:255" json:"description"`
	JobType     *string   `gorm:"size:16" json:"job_type"` // set for JOB quests
	Event       string    `gorm:"size:24;not null;index" json:"event"`
	Target      int       `gorm:"not null" json:"target"`
	RewardCoins int       `gorm:"default:0" json:"reward_coins"`
	RewardJobXP int       `gorm:"default:0" json:"reward_job_xp"`
	SortOrder   int       `gorm:"default:0" json:"sort_order"`
	Active      bool      `gorm:"default:true;index" json:"active"`
	CreatedAt   time.Time `json:"created_at"`
}

func (q *Quest) BeforeCreate(_ *gorm.DB) error {
	if q.ID == "" {
		q.ID = uuid.NewString()
	}
	return nil
}

// PlayerQuest is one player's progress on one quest within one period.
// PeriodKey is "-" for MAIN/JOB quests, a date for DAILY, an ISO week for
// WEEKLY/COMMUNITY — the unique index makes daily/weekly resets race-safe
// (iron rule §10: uniqueness is enforced at the DB level).
type PlayerQuest struct {
	ID          string     `gorm:"primaryKey;size:36" json:"id"`
	PlayerID    string     `gorm:"size:36;not null;uniqueIndex:idx_player_quest_period" json:"player_id"`
	Player      *User      `gorm:"foreignKey:PlayerID" json:"-"`
	QuestID     string     `gorm:"size:36;not null;uniqueIndex:idx_player_quest_period" json:"quest_id"`
	Quest       *Quest     `gorm:"foreignKey:QuestID" json:"quest,omitempty"`
	PeriodKey   string     `gorm:"size:16;not null;uniqueIndex:idx_player_quest_period" json:"period_key"`
	Progress    int        `gorm:"default:0" json:"progress"`
	Status      string     `gorm:"size:12;default:ACTIVE;index" json:"status"`
	CompletedAt *time.Time `json:"completed_at"`
	ClaimedAt   *time.Time `json:"claimed_at"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

func (pq *PlayerQuest) BeforeCreate(_ *gorm.DB) error {
	if pq.ID == "" {
		pq.ID = uuid.NewString()
	}
	return nil
}

// CommunityProgress is the server-wide accumulator for a COMMUNITY quest in
// one period (everyone's events add up; one row per quest+period).
type CommunityProgress struct {
	ID        string    `gorm:"primaryKey;size:36" json:"id"`
	QuestID   string    `gorm:"size:36;not null;uniqueIndex:idx_community_period" json:"quest_id"`
	Quest     *Quest    `gorm:"foreignKey:QuestID" json:"quest,omitempty"`
	PeriodKey string    `gorm:"size:16;not null;uniqueIndex:idx_community_period" json:"period_key"`
	Progress  int       `gorm:"default:0" json:"progress"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (cp *CommunityProgress) BeforeCreate(_ *gorm.DB) error {
	if cp.ID == "" {
		cp.ID = uuid.NewString()
	}
	return nil
}

type QuestStore interface {
	ListActive() ([]Quest, error)
	FindByID(id string) (*Quest, error)
	// ListPlayerPeriod returns the player's rows for the given quest ids in
	// their current periods.
	ListPlayer(playerID string) ([]PlayerQuest, error)
	// Advance increments progress on (player, quest, period) inside tx,
	// creating the row when missing, and flips status to COMPLETED when the
	// target is reached. Returns the updated row.
	Advance(tx *gorm.DB, playerID string, quest *Quest, periodKey string, n int) (*PlayerQuest, error)
	// Claim flips COMPLETED -> CLAIMED guarded (returns rows affected).
	Claim(tx *gorm.DB, playerID, questID, periodKey string) (int64, error)
	FindPlayerQuest(playerID, questID, periodKey string) (*PlayerQuest, error)
	// AddCommunity increments the server-wide accumulator inside tx.
	AddCommunity(tx *gorm.DB, questID, periodKey string, n int) (*CommunityProgress, error)
	FindCommunity(questID, periodKey string) (*CommunityProgress, error)
}

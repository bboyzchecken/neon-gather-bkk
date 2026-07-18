package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ============================================================
// Heart system (Phase 2 §6) — IRON RULES, enforced structurally:
//
//  a) Affinity can ONLY reference StaffNPC. PlayerAffinity.StaffID carries a
//     real SQL foreign key with a constraint onto staff_npcs(id) — inserting
//     a row whose StaffID is a real player's user id FAILS at the DB layer
//     (covered by a test in heart_test.go). There is NO code path and NO
//     schema shape that can attach heart points to a real player.
//  b) No endpoint converts real money into heart points. Points only come
//     from in-game actions computed server-side.
//  c) All content is wholesome/all-ages; every character is an adult.
//  d) No jealousy mechanics — affinity rows are independent per NPC.
//  e) The client renders StaffNPC with an explicit badge (is_npc flag on
//     every DTO) so NPCs can never be mistaken for real players.
//  f) heart points and last_talked_at are server-computed only.
//  g) story nodes may refuse: RequiredLevel gates + RefusalText lets a
//     character keep boundaries instead of auto-unlocking everything.
// ============================================================

// StaffNPC is a designed story character (adult, wholesome cast). It lives
// in its OWN table — never a row in users.
type StaffNPC struct {
	ID              string    `gorm:"primaryKey;size:36" json:"id"`
	Name            string    `gorm:"size:64;not null" json:"name"`
	ArtistCredit    string    `gorm:"size:96" json:"artist_credit"`
	HomeShopID      *string   `gorm:"size:36" json:"home_shop_id"`
	HomeShop        *Plot     `gorm:"foreignKey:HomeShopID" json:"home_shop,omitempty"`
	ShiftStartHour  int       `gorm:"default:18" json:"shift_start_hour"` // server-time hours
	ShiftEndHour    int       `gorm:"default:24" json:"shift_end_hour"`
	SignatureMenu   string    `gorm:"size:64" json:"signature_menu"`
	Season          string    `gorm:"size:16" json:"season"`
	IsActive        bool      `gorm:"default:true" json:"is_active"`
	Bio             string    `gorm:"size:255" json:"bio"`
	CreatedAt       time.Time `json:"created_at"`
}

func (n *StaffNPC) BeforeCreate(_ *gorm.DB) error {
	if n.ID == "" {
		n.ID = uuid.NewString()
	}
	return nil
}

// StaffGiftPref: how a character feels about receiving one item (by name —
// items are player-crafted, matched case-insensitively).
type StaffGiftPref struct {
	ID         string    `gorm:"primaryKey;size:36" json:"id"`
	StaffID    string    `gorm:"size:36;not null;uniqueIndex:idx_staff_gift" json:"staff_id"`
	Staff      *StaffNPC `gorm:"foreignKey:StaffID;constraint:OnDelete:CASCADE" json:"-"`
	ItemName   string    `gorm:"size:64;not null;uniqueIndex:idx_staff_gift" json:"item_name"`
	Preference string    `gorm:"size:12;not null" json:"preference"` // LOVED/LIKED/NEUTRAL/DISLIKED
}

func (g *StaffGiftPref) BeforeCreate(_ *gorm.DB) error {
	if g.ID == "" {
		g.ID = uuid.NewString()
	}
	return nil
}

// PlayerAffinity binds a PLAYER to a STAFF NPC — the StaffID foreign key
// physically cannot point at the users table (iron rule a).
type PlayerAffinity struct {
	ID           string     `gorm:"primaryKey;size:36" json:"id"`
	PlayerID     string     `gorm:"size:36;not null;uniqueIndex:idx_player_staff_affinity" json:"player_id"`
	Player       *User      `gorm:"foreignKey:PlayerID" json:"-"`
	StaffID      string     `gorm:"size:36;not null;uniqueIndex:idx_player_staff_affinity" json:"staff_id"`
	Staff        *StaffNPC  `gorm:"foreignKey:StaffID;constraint:OnDelete:CASCADE" json:"staff,omitempty"`
	HeartPoints  int        `gorm:"default:0" json:"heart_points"`
	HeartLevel   int        `gorm:"default:0" json:"heart_level"`
	LastTalkedAt *time.Time `json:"last_talked_at"` // server time only (iron rule f)
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

func (a *PlayerAffinity) BeforeCreate(_ *gorm.DB) error {
	if a.ID == "" {
		a.ID = uuid.NewString()
	}
	return nil
}

// StaffStoryNode is one entry of a character's reward/story track. A node
// may carry RefusalText shown when the character declines despite the level
// (iron rule g — characters have boundaries).
type StaffStoryNode struct {
	ID            string    `gorm:"primaryKey;size:36" json:"id"`
	StaffID       string    `gorm:"size:36;not null;index" json:"staff_id"`
	Staff         *StaffNPC `gorm:"foreignKey:StaffID;constraint:OnDelete:CASCADE" json:"-"`
	RequiredLevel int       `gorm:"not null" json:"required_level"`
	Title         string    `gorm:"size:96;not null" json:"title"`
	StoryText     string    `gorm:"size:600;not null" json:"story_text"`
	RewardType    string    `gorm:"size:24" json:"reward_type"` // DIALOGUE/COASTER/RECIPE/COSMETIC/QUEST/VISIT/TITLE/PHOTO
	RewardRef     string    `gorm:"size:64" json:"reward_ref"`
	RefusalText   string    `gorm:"size:255" json:"refusal_text"`
}

func (n *StaffStoryNode) BeforeCreate(_ *gorm.DB) error {
	if n.ID == "" {
		n.ID = uuid.NewString()
	}
	return nil
}

// Gift preference values
const (
	GiftLoved    = "LOVED"
	GiftLiked    = "LIKED"
	GiftNeutral  = "NEUTRAL"
	GiftDisliked = "DISLIKED"
)

type HeartStore interface {
	ListActiveNPCs() ([]StaffNPC, error)
	FindNPC(id string) (*StaffNPC, error)
	ListGiftPrefs(staffID string) ([]StaffGiftPref, error)
	ListStoryNodes(staffID string) ([]StaffStoryNode, error)
	// AddHearts upserts the (player, staff) affinity inside tx, adds points
	// and recomputes the level. Returns the row and whether it levelled.
	AddHearts(tx *gorm.DB, playerID, staffID string, points int) (*PlayerAffinity, bool, error)
	FindAffinity(playerID, staffID string) (*PlayerAffinity, error)
	ListAffinities(playerID string) ([]PlayerAffinity, error)
	// TouchTalked sets last_talked_at = now (server time) guarded to once
	// per server-local day. Returns rows affected (0 = already talked today).
	TouchTalked(tx *gorm.DB, affinityID string, now time.Time) (int64, error)
}

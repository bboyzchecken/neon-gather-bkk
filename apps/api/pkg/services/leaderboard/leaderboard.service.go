package leaderboard

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"

	"neongather/pkg/models"
)

type Entry struct {
	Rank        int    `json:"rank"`
	PlayerID    string `json:"player_id"`
	DisplayName string `json:"display_name"`
	Score       int    `json:"score"`
}

// Service tracks a weekly "earnings" leaderboard (coins earned from vendor
// sales and marketplace sales) in a Redis sorted set.
type Service struct {
	rdb   *redis.Client
	users models.UserStore
}

func New(rdb *redis.Client, users models.UserStore) *Service {
	return &Service{rdb: rdb, users: users}
}

func weekKey(t time.Time) string {
	y, w := t.ISOWeek()
	return fmt.Sprintf("lb:earnings:weekly:%d-W%02d", y, w)
}

// AddEarnings increments the player's weekly earnings score.
func (s *Service) AddEarnings(ctx context.Context, userID string, amount int) error {
	if amount <= 0 {
		return nil
	}
	return s.rdb.ZIncrBy(ctx, weekKey(time.Now()), float64(amount), userID).Err()
}

// TopEarnings returns the current week's top N earners.
func (s *Service) TopEarnings(ctx context.Context, limit int) ([]Entry, error) {
	z, err := s.rdb.ZRevRangeWithScores(ctx, weekKey(time.Now()), 0, int64(limit-1)).Result()
	if err != nil {
		return nil, err
	}
	entries := make([]Entry, 0, len(z))
	for i, m := range z {
		id, _ := m.Member.(string)
		name := id
		if u, err := s.users.FindByID(id); err == nil {
			name = u.DisplayName
		}
		entries = append(entries, Entry{Rank: i + 1, PlayerID: id, DisplayName: name, Score: int(m.Score)})
	}
	return entries, nil
}

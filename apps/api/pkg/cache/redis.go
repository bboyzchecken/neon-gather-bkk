package cache

import (
	"github.com/redis/go-redis/v9"
	"neongather/pkg/core"
)

// New builds the Redis client (leaderboards, sessions). Provided to fx.
func New(cfg core.Config) *redis.Client {
	return redis.NewClient(&redis.Options{
		Addr:     cfg.Redis.Addr(),
		Password: cfg.Redis.Password,
	})
}

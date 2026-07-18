// Package idle rewards "sitting and chilling" at the bar (Phase 2 §4,
// adapted — the fishing tie-in was cut with the fishing system, D0.8/D2.7).
// A server ticker scans the LIVE hub positions once a minute and awards a
// tiny XP tick to every player relaxing inside the bar zone. Positions come
// from the server's own connection state, so idle progress cannot be faked
// by the client (iron rule §9).
package idle

import (
	"context"
	"time"

	"go.uber.org/fx"
	"gorm.io/gorm"

	dheart "neongather/pkg/domain/heart"
	"neongather/pkg/models"
	"neongather/pkg/services/progress"
	"neongather/pkg/ws"
)

// Bar/food-court zone in grid coords (counter, tables, lounge, cabinet).
const (
	zoneMinX = 13.0
	zoneMaxX = 24.0
	zoneMinY = 7.0
	zoneMaxY = 20.0
	tick     = time.Minute
)

type Service struct {
	hub      *ws.Hub
	progress *progress.Service
	db       *gorm.DB
	hearts   models.HeartStore
	stop     chan struct{}
}

func New(lc fx.Lifecycle, hub *ws.Hub, prog *progress.Service, db *gorm.DB, hearts models.HeartStore) *Service {
	s := &Service{hub: hub, progress: prog, db: db, hearts: hearts, stop: make(chan struct{})}
	lc.Append(fx.Hook{
		OnStart: func(_ context.Context) error {
			go s.run()
			return nil
		},
		OnStop: func(_ context.Context) error {
			close(s.stop)
			return nil
		},
	})
	return s
}

func (s *Service) run() {
	t := time.NewTicker(tick)
	defer t.Stop()
	for {
		select {
		case <-s.stop:
			return
		case <-t.C:
			s.tickOnce()
		}
	}
}

func (s *Service) tickOnce() {
	// §6: sitting in the bar while a character is on shift also warms them
	// up very slowly (passive presence — the slowest heart source by design)
	var onShift []models.StaffNPC
	if npcs, err := s.hearts.ListActiveNPCs(); err == nil {
		h := time.Now().Hour()
		for _, n := range npcs {
			if dheart.OnShift(n.ShiftStartHour, n.ShiftEndHour, h) {
				onShift = append(onShift, n)
			}
		}
	}
	for _, p := range s.hub.Players() {
		if p.X >= zoneMinX && p.X <= zoneMaxX && p.Y >= zoneMinY && p.Y <= zoneMaxY {
			s.progress.Fire(p.ID, models.EventBarIdle)
			for _, n := range onShift {
				pid := p.ID
				nid := n.ID
				_ = s.db.Transaction(func(tx *gorm.DB) error {
					_, _, e := s.hearts.AddHearts(tx, pid, nid, dheart.PointsPresenceTick)
					return e
				})
			}
		}
	}
}

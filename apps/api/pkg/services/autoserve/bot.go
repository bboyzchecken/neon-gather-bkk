// Package autoserve runs the AutoServeBot: a background worker that advances
// dining-table state (order -> serve -> collect -> reset). It is deliberately
// NOT called "NPC" — Phase 2 introduces a distinct, named StaffNPC concept.
package autoserve

import (
	"context"
	"time"

	"go.uber.org/fx"

	"neongather/pkg/models"
	"neongather/pkg/view"
	"neongather/pkg/ws"
)

const (
	tickInterval = 2 * time.Second
	serveDelay   = 4 * time.Second  // ORDERED -> SERVED
	despawnDelay = 30 * time.Second // SERVED -> EMPTY (auto-despawn if never collected)
	resetDelay   = 5 * time.Second  // COLLECTED -> EMPTY
)

type Bot struct {
	tables models.TableStore
	hub    *ws.Hub
	stop   chan struct{}
}

// New wires the bot into the fx lifecycle. Provided to fx.
func New(lc fx.Lifecycle, tables models.TableStore, hub *ws.Hub) *Bot {
	b := &Bot{tables: tables, hub: hub, stop: make(chan struct{})}
	lc.Append(fx.Hook{
		OnStart: func(_ context.Context) error {
			go b.run()
			return nil
		},
		OnStop: func(_ context.Context) error {
			close(b.stop)
			return nil
		},
	})
	return b
}

func (b *Bot) run() {
	t := time.NewTicker(tickInterval)
	defer t.Stop()
	for {
		select {
		case <-b.stop:
			return
		case <-t.C:
			b.tick()
		}
	}
}

func (b *Bot) tick() {
	now := time.Now()

	ordered, _ := b.tables.ListByState(models.TableOrdered)
	for i := range ordered {
		tbl := ordered[i]
		if tbl.OrderedAt != nil && now.Sub(*tbl.OrderedAt) >= serveDelay {
			served := now
			tbl.State = models.TableServed
			tbl.ServedAt = &served
			if err := b.tables.Update(&tbl); err == nil {
				b.hub.BroadcastTable(view.Table(tbl))
			}
		}
	}

	served, _ := b.tables.ListByState(models.TableServed)
	for i := range served {
		tbl := served[i]
		if tbl.ServedAt != nil && now.Sub(*tbl.ServedAt) >= despawnDelay {
			resetTable(&tbl)
			if err := b.tables.Update(&tbl); err == nil {
				b.hub.BroadcastTable(view.Table(tbl))
			}
		}
	}

	collected, _ := b.tables.ListByState(models.TableCollected)
	for i := range collected {
		tbl := collected[i]
		if now.Sub(tbl.UpdatedAt) >= resetDelay {
			resetTable(&tbl)
			if err := b.tables.Update(&tbl); err == nil {
				b.hub.BroadcastTable(view.Table(tbl))
			}
		}
	}
}

func resetTable(t *models.DiningTable) {
	t.State = models.TableEmpty
	t.OrderName = nil
	t.OrderedAt = nil
	t.ServedAt = nil
}

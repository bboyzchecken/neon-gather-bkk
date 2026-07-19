// Package view converts DB models into wire/broadcast shapes (snake_case).
package view

import (
	"time"

	"neongather/pkg/models"
	"neongather/pkg/ws"
)

func Table(t models.DiningTable) ws.TableView {
	order := ""
	if t.OrderName != nil {
		order = *t.OrderName
	}
	return ws.TableView{
		ID:        t.ID,
		Code:      t.Code,
		Floor:     t.Floor,
		GridX:     t.GridX,
		GridY:     t.GridY,
		State:     t.State,
		OrderName: order,
		UpdatedAt: t.UpdatedAt.Format(time.RFC3339),
	}
}

func Tables(ts []models.DiningTable) []ws.TableView {
	out := make([]ws.TableView, 0, len(ts))
	for _, t := range ts {
		out = append(out, Table(t))
	}
	return out
}

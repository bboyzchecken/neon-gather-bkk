package api

import (
	"net/http"
	"time"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"

	"neongather/pkg/models"
	"neongather/pkg/view"
)

func (s *Server) ListTables(c echo.Context) error {
	tables, err := s.Tables.List()
	if err != nil {
		return errJSON(c, http.StatusInternalServerError, "could not list tables")
	}
	return c.JSON(http.StatusOK, view.Tables(tables))
}

type orderReq struct {
	OrderName string `json:"order_name" validate:"max=64"`
}

func (s *Server) OrderTable(c echo.Context) error {
	id := c.Param("id")
	t, err := s.Tables.FindByID(id)
	if err != nil {
		return errJSON(c, http.StatusNotFound, "table not found")
	}
	if t.State != models.TableEmpty {
		return errJSON(c, http.StatusBadRequest, "table is not free")
	}
	var body orderReq
	_ = c.Bind(&body)
	name := body.OrderName
	if name == "" {
		name = "House Special"
	}
	now := time.Now()
	t.State = models.TableOrdered
	t.OrderName = &name
	t.OrderedAt = &now
	t.ServedAt = nil
	if err := s.Tables.Update(t); err != nil {
		return errJSON(c, http.StatusInternalServerError, "order failed")
	}
	s.Hub.BroadcastTable(view.Table(*t))
	s.Progress.Fire(userID(c), models.EventTableOrder)
	// Notify employed staff of the plot so they can come serve (Phase 1 job board).
	if t.PlotID != nil {
		if staff, err := s.Staff.ActiveStaffForPlot(*t.PlotID); err == nil {
			for _, e := range staff {
				s.Hub.SendTo(e.StaffID, map[string]any{
					"type": "order_alert", "table_id": t.ID, "table_code": t.Code,
					"plot_id": *t.PlotID, "order_name": name,
				})
			}
		}
	}
	return c.JSON(http.StatusOK, view.Table(*t))
}

func (s *Server) CollectTable(c echo.Context) error {
	id := c.Param("id")
	uid := userID(c)
	t, err := s.Tables.FindByID(id)
	if err != nil {
		return errJSON(c, http.StatusNotFound, "table not found")
	}
	if t.State != models.TableServed {
		return errJSON(c, http.StatusBadRequest, "nothing to collect")
	}
	t.State = models.TableCollected
	if err := s.Tables.Update(t); err != nil {
		return errJSON(c, http.StatusInternalServerError, "collect failed")
	}
	s.Hub.BroadcastTable(view.Table(*t))
	s.Progress.Fire(uid, models.EventTableCollect)
	s.payStaffWage(t, uid)
	return c.JSON(http.StatusOK, view.Table(*t))
}

// payStaffWage pays the posting's wage owner → staff when the collector is
// employed ACTIVE on the table's plot. Zero-sum via the ledger; silently
// skipped when the owner can't cover it (async economy must not break collect).
func (s *Server) payStaffWage(t *models.DiningTable, collectorID string) {
	if t.PlotID == nil {
		return
	}
	staff, err := s.Staff.ActiveStaffForPlot(*t.PlotID)
	if err != nil {
		return
	}
	for _, e := range staff {
		if e.StaffID != collectorID || e.OwnerID == collectorID {
			continue
		}
		posting, err := s.Staff.FindPosting(e.PostingID)
		if err != nil || posting.WagePerTask <= 0 {
			return
		}
		wage := posting.WagePerTask
		err = s.DB.Transaction(func(tx *gorm.DB) error {
			if _, e2 := s.Wallet.ApplyDelta(tx, e.OwnerID, -wage, models.LedgerWagePay, e.ID, "wage "+t.Code); e2 != nil {
				return e2
			}
			if _, e2 := s.Wallet.ApplyDelta(tx, e.StaffID, wage, models.LedgerWageReceive, e.ID, "wage "+t.Code); e2 != nil {
				return e2
			}
			return nil
		})
		if err == nil {
			s.Hub.SendTo(e.StaffID, map[string]any{
				"type": "wage_paid", "amount": wage, "table_code": t.Code,
			})
		}
		return
	}
}

package api

import (
	"net/http"
	"time"

	"github.com/labstack/echo/v4"

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
	return c.JSON(http.StatusOK, view.Table(*t))
}

func (s *Server) CollectTable(c echo.Context) error {
	id := c.Param("id")
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
	return c.JSON(http.StatusOK, view.Table(*t))
}

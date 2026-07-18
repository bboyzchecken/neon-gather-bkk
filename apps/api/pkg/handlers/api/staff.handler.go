package api

import (
	"errors"
	"net/http"
	"time"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"

	dwallet "neongather/pkg/domain/wallet"
	"neongather/pkg/models"
)

// Job board (Phase 1). Player↔player relations are limited to tips, reviews
// and ratings — no heart points or affection accumulators on real players
// (iron rule; the Phase 2 heart system binds to StaffNPC only).

type postingDTO struct {
	ID          string  `json:"id"`
	PlotID      string  `json:"plot_id"`
	PlotCode    *string `json:"plot_code"`
	OwnerID     string  `json:"owner_id"`
	OwnerName   *string `json:"owner_name"`
	Title       string  `json:"title"`
	Description string  `json:"description"`
	WagePerTask int     `json:"wage_per_task"`
	Status      string  `json:"status"`
	CreatedAt   string  `json:"created_at"`
}

func toPostingDTO(p models.JobPosting) postingDTO {
	dto := postingDTO{
		ID: p.ID, PlotID: p.PlotID, OwnerID: p.OwnerID, Title: p.Title,
		Description: p.Description, WagePerTask: p.WagePerTask, Status: p.Status,
		CreatedAt: p.CreatedAt.Format(time.RFC3339),
	}
	if p.Plot != nil {
		code := p.Plot.Code
		dto.PlotCode = &code
	}
	if p.Owner != nil {
		name := p.Owner.DisplayName
		dto.OwnerName = &name
	}
	return dto
}

type employmentDTO struct {
	ID        string  `json:"id"`
	PostingID string  `json:"posting_id"`
	PlotID    string  `json:"plot_id"`
	StaffID   string  `json:"staff_id"`
	StaffName *string `json:"staff_name"`
	Status    string  `json:"status"`
	AppliedAt string  `json:"applied_at"`
	HiredAt   *string `json:"hired_at"`
}

func toEmploymentDTO(e models.Employment) employmentDTO {
	dto := employmentDTO{
		ID: e.ID, PostingID: e.PostingID, PlotID: e.PlotID, StaffID: e.StaffID,
		Status: e.Status, AppliedAt: e.AppliedAt.Format(time.RFC3339),
	}
	if e.Staff != nil {
		name := e.Staff.DisplayName
		dto.StaffName = &name
	}
	if e.HiredAt != nil {
		h := e.HiredAt.Format(time.RFC3339)
		dto.HiredAt = &h
	}
	return dto
}

func (s *Server) ListPostings(c echo.Context) error {
	ps, err := s.Staff.ListOpenPostings()
	if err != nil {
		return errJSON(c, http.StatusInternalServerError, "could not list postings")
	}
	out := make([]postingDTO, 0, len(ps))
	for _, p := range ps {
		out = append(out, toPostingDTO(p))
	}
	return c.JSON(http.StatusOK, out)
}

type createPostingReq struct {
	PlotID      string `json:"plot_id" validate:"required"`
	Title       string `json:"title" validate:"required,min=3,max=80"`
	Description string `json:"description" validate:"max=255"`
	WagePerTask int    `json:"wage_per_task" validate:"required,min=1,max=1000"`
}

func (s *Server) CreatePosting(c echo.Context) error {
	uid := userID(c)
	var body createPostingReq
	if err := c.Bind(&body); err != nil {
		return errJSON(c, http.StatusBadRequest, "invalid body")
	}
	if err := c.Validate(&body); err != nil {
		return errJSON(c, http.StatusUnprocessableEntity, err.Error())
	}
	plot, err := s.Plots.FindByID(body.PlotID)
	if err != nil {
		return errJSON(c, http.StatusNotFound, "plot not found")
	}
	if plot.OwnerID == nil || *plot.OwnerID != uid {
		return errJSON(c, http.StatusForbidden, "you do not own this plot")
	}
	p := &models.JobPosting{
		PlotID: plot.ID, OwnerID: uid, Title: body.Title,
		Description: body.Description, WagePerTask: body.WagePerTask,
		Status: models.PostingOpen,
	}
	if err := s.Staff.CreatePosting(p); err != nil {
		return errJSON(c, http.StatusInternalServerError, "could not create posting")
	}
	full, _ := s.Staff.FindPosting(p.ID)
	return c.JSON(http.StatusCreated, toPostingDTO(*full))
}

func (s *Server) ClosePosting(c echo.Context) error {
	uid := userID(c)
	p, err := s.Staff.FindPosting(c.Param("id"))
	if err != nil {
		return errJSON(c, http.StatusNotFound, "posting not found")
	}
	if p.OwnerID != uid {
		return errJSON(c, http.StatusForbidden, "not your posting")
	}
	p.Status = models.PostingClosed
	if err := s.Staff.UpdatePosting(p); err != nil {
		return errJSON(c, http.StatusInternalServerError, "close failed")
	}
	return c.JSON(http.StatusOK, toPostingDTO(*p))
}

func (s *Server) ApplyToPosting(c echo.Context) error {
	uid := userID(c)
	p, err := s.Staff.FindPosting(c.Param("id"))
	if err != nil {
		return errJSON(c, http.StatusNotFound, "posting not found")
	}
	if p.Status != models.PostingOpen {
		return errJSON(c, http.StatusBadRequest, "posting is closed")
	}
	if p.OwnerID == uid {
		return errJSON(c, http.StatusBadRequest, "cannot apply to your own posting")
	}
	e := &models.Employment{
		PostingID: p.ID, PlotID: p.PlotID, OwnerID: p.OwnerID,
		StaffID: uid, Status: models.EmploymentApplied,
	}
	if err := s.Staff.CreateEmployment(e); err != nil {
		// unique (posting, staff) — a second apply hits the constraint
		return errJSON(c, http.StatusBadRequest, "already applied")
	}
	s.Hub.SendTo(p.OwnerID, map[string]any{
		"type": "staff_applied", "posting_id": p.ID, "employment_id": e.ID,
	})
	full, _ := s.Staff.FindEmployment(e.ID)
	return c.JSON(http.StatusCreated, toEmploymentDTO(*full))
}

func (s *Server) ListApplications(c echo.Context) error {
	uid := userID(c)
	p, err := s.Staff.FindPosting(c.Param("id"))
	if err != nil {
		return errJSON(c, http.StatusNotFound, "posting not found")
	}
	if p.OwnerID != uid {
		return errJSON(c, http.StatusForbidden, "not your posting")
	}
	es, err := s.Staff.ListEmploymentsByPosting(p.ID)
	if err != nil {
		return errJSON(c, http.StatusInternalServerError, "could not list applications")
	}
	out := make([]employmentDTO, 0, len(es))
	for _, e := range es {
		out = append(out, toEmploymentDTO(e))
	}
	return c.JSON(http.StatusOK, out)
}

func (s *Server) MyEmployments(c echo.Context) error {
	es, err := s.Staff.ListEmploymentsByStaff(userID(c))
	if err != nil {
		return errJSON(c, http.StatusInternalServerError, "could not list employments")
	}
	out := make([]employmentDTO, 0, len(es))
	for _, e := range es {
		out = append(out, toEmploymentDTO(e))
	}
	return c.JSON(http.StatusOK, out)
}

func (s *Server) HireStaff(c echo.Context) error {
	uid := userID(c)
	e, err := s.Staff.FindEmployment(c.Param("id"))
	if err != nil {
		return errJSON(c, http.StatusNotFound, "application not found")
	}
	if e.OwnerID != uid {
		return errJSON(c, http.StatusForbidden, "not your posting")
	}
	if e.Status != models.EmploymentApplied {
		return errJSON(c, http.StatusBadRequest, "application is not open")
	}
	now := time.Now()
	e.Status = models.EmploymentActive
	e.HiredAt = &now
	if err := s.Staff.UpdateEmployment(e); err != nil {
		return errJSON(c, http.StatusInternalServerError, "hire failed")
	}
	s.Progress.Fire(e.StaffID, models.EventShiftHired)
	s.Hub.SendTo(e.StaffID, map[string]any{
		"type": "staff_hired", "employment_id": e.ID, "plot_id": e.PlotID,
	})
	return c.JSON(http.StatusOK, toEmploymentDTO(*e))
}

func (s *Server) EndEmployment(c echo.Context) error {
	uid := userID(c)
	e, err := s.Staff.FindEmployment(c.Param("id"))
	if err != nil {
		return errJSON(c, http.StatusNotFound, "employment not found")
	}
	if e.OwnerID != uid && e.StaffID != uid {
		return errJSON(c, http.StatusForbidden, "not yours to end")
	}
	if e.Status == models.EmploymentEnded {
		return errJSON(c, http.StatusBadRequest, "already ended")
	}
	now := time.Now()
	e.Status = models.EmploymentEnded
	e.EndedAt = &now
	if err := s.Staff.UpdateEmployment(e); err != nil {
		return errJSON(c, http.StatusInternalServerError, "end failed")
	}
	return c.JSON(http.StatusOK, toEmploymentDTO(*e))
}

type tipReq struct {
	Amount int `json:"amount" validate:"required,min=1,max=10000"`
}

// TipStaff moves coins tipper → staff, zero-sum, through the ledger.
func (s *Server) TipStaff(c echo.Context) error {
	uid := userID(c)
	e, err := s.Staff.FindEmployment(c.Param("id"))
	if err != nil {
		return errJSON(c, http.StatusNotFound, "employment not found")
	}
	if e.StaffID == uid {
		return errJSON(c, http.StatusBadRequest, "cannot tip yourself")
	}
	var body tipReq
	if err := c.Bind(&body); err != nil {
		return errJSON(c, http.StatusBadRequest, "invalid body")
	}
	if err := c.Validate(&body); err != nil {
		return errJSON(c, http.StatusUnprocessableEntity, err.Error())
	}
	err = s.DB.Transaction(func(tx *gorm.DB) error {
		if _, e2 := s.Wallet.ApplyDelta(tx, uid, -body.Amount, models.LedgerTipPay, e.ID, "tip staff"); e2 != nil {
			return e2
		}
		if _, e2 := s.Wallet.ApplyDelta(tx, e.StaffID, body.Amount, models.LedgerTipReceive, e.ID, "tip received"); e2 != nil {
			return e2
		}
		return nil
	})
	if err != nil {
		if errors.Is(err, dwallet.ErrInsufficientFunds) {
			return errJSON(c, http.StatusBadRequest, "insufficient funds")
		}
		return errJSON(c, http.StatusInternalServerError, "tip failed")
	}
	s.Progress.Fire(e.StaffID, models.EventTipReceive)
	s.Hub.SendTo(e.StaffID, map[string]any{
		"type": "tip_received", "amount": body.Amount, "employment_id": e.ID,
	})
	return c.JSON(http.StatusOK, map[string]any{"tipped": body.Amount})
}

type reviewReq struct {
	Stars   int    `json:"stars" validate:"required,min=1,max=5"`
	Comment string `json:"comment" validate:"max=255"`
}

func (s *Server) ReviewStaff(c echo.Context) error {
	uid := userID(c)
	e, err := s.Staff.FindEmployment(c.Param("id"))
	if err != nil {
		return errJSON(c, http.StatusNotFound, "employment not found")
	}
	if e.StaffID == uid {
		return errJSON(c, http.StatusBadRequest, "cannot review yourself")
	}
	var body reviewReq
	if err := c.Bind(&body); err != nil {
		return errJSON(c, http.StatusBadRequest, "invalid body")
	}
	if err := c.Validate(&body); err != nil {
		return errJSON(c, http.StatusUnprocessableEntity, err.Error())
	}
	r := &models.StaffReview{
		EmploymentID: e.ID, RaterID: uid, StaffID: e.StaffID,
		Stars: body.Stars, Comment: body.Comment,
	}
	if err := s.Staff.CreateReview(r); err != nil {
		return errJSON(c, http.StatusBadRequest, "already reviewed")
	}
	return c.JSON(http.StatusCreated, r)
}

func (s *Server) StaffReviews(c echo.Context) error {
	rs, err := s.Staff.ListReviewsForStaff(c.Param("staff_id"))
	if err != nil {
		return errJSON(c, http.StatusInternalServerError, "could not list reviews")
	}
	return c.JSON(http.StatusOK, rs)
}

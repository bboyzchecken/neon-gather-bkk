package api

import (
	"errors"
	"io"
	"net/http"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"

	dwallet "neongather/pkg/domain/wallet"
	"neongather/pkg/models"
)

func (s *Server) ListPlots(c echo.Context) error {
	plots, err := s.Plots.List()
	if err != nil {
		return errJSON(c, http.StatusInternalServerError, "could not list plots")
	}
	uid := userID(c)
	out := make([]plotDTO, 0, len(plots))
	for _, p := range plots {
		out = append(out, toPlotDTO(p, uid))
	}
	return c.JSON(http.StatusOK, out)
}

func (s *Server) RentPlot(c echo.Context) error {
	id := c.Param("id")
	uid := userID(c)

	p, err := s.Plots.FindByID(id)
	if err != nil {
		return errJSON(c, http.StatusNotFound, "plot not found")
	}

	err = s.DB.Transaction(func(tx *gorm.DB) error {
		n, e := s.Plots.ClaimVacant(tx, id, uid)
		if e != nil {
			return e
		}
		if n == 0 {
			return errPlotUnavailable
		}
		if _, e := s.Wallet.ApplyDelta(tx, uid, -p.RentPrice, models.LedgerRentPay, p.ID, "rent "+p.Code); e != nil {
			return e
		}
		return nil
	})
	if err != nil {
		switch {
		case errors.Is(err, errPlotUnavailable):
			return errJSON(c, http.StatusBadRequest, "plot is not available")
		case errors.Is(err, dwallet.ErrInsufficientFunds):
			return errJSON(c, http.StatusBadRequest, "insufficient funds")
		default:
			return errJSON(c, http.StatusInternalServerError, "rent failed")
		}
	}

	s.Progress.Fire(uid, models.EventPlotRent)

	var full models.Plot
	_ = s.DB.Preload("Owner").First(&full, "id = ?", id).Error
	return c.JSON(http.StatusOK, toPlotDTO(full, uid))
}

type setFacadeReq struct {
	Template string `json:"template" validate:"required,oneof=CAFE VINTAGE STREETFOOD"`
}

func (s *Server) SetFacade(c echo.Context) error {
	id := c.Param("id")
	uid := userID(c)

	var body setFacadeReq
	if err := c.Bind(&body); err != nil {
		return errJSON(c, http.StatusBadRequest, "invalid body")
	}
	if err := c.Validate(&body); err != nil {
		return errJSON(c, http.StatusUnprocessableEntity, err.Error())
	}

	p, err := s.Plots.FindByID(id)
	if err != nil {
		return errJSON(c, http.StatusNotFound, "plot not found")
	}
	if p.OwnerID == nil || *p.OwnerID != uid {
		return errJSON(c, http.StatusForbidden, "you do not own this plot")
	}
	p.FacadeTemplate = body.Template
	if err := s.Plots.Update(p); err != nil {
		return errJSON(c, http.StatusInternalServerError, "update failed")
	}

	var full models.Plot
	_ = s.DB.Preload("Owner").First(&full, "id = ?", id).Error
	return c.JSON(http.StatusOK, toPlotDTO(full, uid))
}

func (s *Server) UploadFacadeTexture(c echo.Context) error {
	id := c.Param("id")
	uid := userID(c)

	p, err := s.Plots.FindByID(id)
	if err != nil {
		return errJSON(c, http.StatusNotFound, "plot not found")
	}
	if p.OwnerID == nil || *p.OwnerID != uid {
		return errJSON(c, http.StatusForbidden, "you do not own this plot")
	}

	fileHeader, err := c.FormFile("file")
	if err != nil {
		return errJSON(c, http.StatusBadRequest, "no file uploaded")
	}
	contentType := fileHeader.Header.Get("Content-Type")

	// Content-moderation stub (iron rule: player uploads pass through it).
	verdict := s.Moderation.Screen(contentType, int(fileHeader.Size))
	if !verdict.OK {
		return errJSON(c, http.StatusBadRequest, verdict.Reason)
	}

	f, err := fileHeader.Open()
	if err != nil {
		return errJSON(c, http.StatusBadRequest, "cannot read file")
	}
	defer f.Close()
	data, err := io.ReadAll(f)
	if err != nil {
		return errJSON(c, http.StatusBadRequest, "cannot read file")
	}

	url, err := s.Storage.Upload(c.Request().Context(), data, contentType, "facades/"+id)
	if err != nil {
		return errJSON(c, http.StatusInternalServerError, "upload failed")
	}

	status := verdict.Status
	p.FacadeTextureURL = &url
	p.FacadeModeration = &status
	if err := s.Plots.Update(p); err != nil {
		return errJSON(c, http.StatusInternalServerError, "update failed")
	}

	var full models.Plot
	_ = s.DB.Preload("Owner").First(&full, "id = ?", id).Error
	return c.JSON(http.StatusOK, toPlotDTO(full, uid))
}

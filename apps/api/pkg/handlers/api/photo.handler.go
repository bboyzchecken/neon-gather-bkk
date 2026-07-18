package api

import (
	"io"
	"net/http"

	"github.com/labstack/echo/v4"

	"neongather/pkg/models"
)

type photoDTO struct {
	ID         string `json:"id"`
	URL        string `json:"url"`
	PhotoType  string `json:"photo_type"`
	Background string `json:"background"`
	Caption    string `json:"caption"`
	ShareToken string `json:"share_token"`
	Moderation string `json:"moderation"`
	CreatedAt  string `json:"created_at"`
}

func toPhotoDTO(p models.Photo) photoDTO {
	return photoDTO{
		ID: p.ID, URL: p.URL, PhotoType: p.PhotoType, Background: p.Background,
		Caption: p.Caption, ShareToken: p.ShareToken, Moderation: p.Moderation,
		CreatedAt: p.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
}

// UploadPhoto stores a photo-booth canvas capture. Player-generated imagery,
// so it passes the moderation stub like every other upload surface.
func (s *Server) UploadPhoto(c echo.Context) error {
	uid := userID(c)

	fileHeader, err := c.FormFile("file")
	if err != nil {
		return errJSON(c, http.StatusBadRequest, "no file uploaded")
	}
	contentType := fileHeader.Header.Get("Content-Type")
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
	url, err := s.Storage.Upload(c.Request().Context(), data, contentType, "photos/"+uid)
	if err != nil {
		return errJSON(c, http.StatusInternalServerError, "upload failed")
	}

	background := c.FormValue("background")
	caption := c.FormValue("caption")
	if len(background) > 32 {
		background = background[:32]
	}
	if len(caption) > 120 {
		caption = caption[:120]
	}
	p := &models.Photo{
		UserID: uid, URL: url, PhotoType: models.PhotoBooth,
		Background: background, Caption: caption, Moderation: verdict.Status,
	}
	if err := s.Photos.Create(p); err != nil {
		return errJSON(c, http.StatusInternalServerError, "could not save photo")
	}
	s.Progress.Fire(uid, models.EventPhotoTaken)
	return c.JSON(http.StatusCreated, toPhotoDTO(*p))
}

func (s *Server) MyPhotos(c echo.Context) error {
	ps, err := s.Photos.ListByUser(userID(c))
	if err != nil {
		return errJSON(c, http.StatusInternalServerError, "could not list photos")
	}
	out := make([]photoDTO, 0, len(ps))
	for _, p := range ps {
		out = append(out, toPhotoDTO(p))
	}
	return c.JSON(http.StatusOK, out)
}

func (s *Server) DeletePhoto(c echo.Context) error {
	n, err := s.Photos.DeleteOwned(c.Param("id"), userID(c))
	if err != nil {
		return errJSON(c, http.StatusInternalServerError, "delete failed")
	}
	if n == 0 {
		return errJSON(c, http.StatusNotFound, "photo not found")
	}
	return c.JSON(http.StatusOK, map[string]bool{"deleted": true})
}

// SharedPhoto is the PUBLIC share endpoint (no auth) — looked up by the
// unguessable share token only.
func (s *Server) SharedPhoto(c echo.Context) error {
	p, err := s.Photos.FindByShareToken(c.Param("token"))
	if err != nil {
		return errJSON(c, http.StatusNotFound, "photo not found")
	}
	owner := ""
	if p.User != nil {
		owner = p.User.DisplayName
	}
	return c.JSON(http.StatusOK, map[string]any{
		"url": p.URL, "caption": p.Caption, "background": p.Background,
		"photo_type": p.PhotoType, "owner_name": owner,
		"created_at": p.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
	})
}

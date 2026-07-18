package moderation

import (
	"fmt"

	"neongather/pkg/models"
)

const maxBytes = 5 * 1024 * 1024 // 5 MB

var allowedTypes = map[string]bool{
	"image/png":  true,
	"image/jpeg": true,
	"image/webp": true,
}

type Result struct {
	OK     bool
	Status string
	Reason string
}

// Service is the Phase 0 content-moderation STUB (iron rule: any player upload
// path ships with at least a moderation stub). Validates type/size and queues
// everything as PENDING_REVIEW. Real moderation (Rekognition/Vision) is Phase 4.
type Service struct{}

func New() *Service { return &Service{} }

func (s *Service) Screen(contentType string, size int) Result {
	if !allowedTypes[contentType] {
		return Result{OK: false, Status: models.ModRejected, Reason: fmt.Sprintf("unsupported file type: %s", contentType)}
	}
	if size > maxBytes {
		return Result{OK: false, Status: models.ModRejected, Reason: "file too large (max 5MB)"}
	}
	return Result{OK: true, Status: models.ModPendingReview}
}

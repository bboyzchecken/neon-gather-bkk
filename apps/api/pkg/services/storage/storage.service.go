package storage

import (
	"bytes"
	"context"
	"fmt"
	"regexp"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/google/uuid"

	"neongather/pkg/core"
)

var extSanitize = regexp.MustCompile(`[^a-z0-9]`)

type Service struct {
	client    *s3.Client
	bucket    string
	publicURL string
}

// New builds the storage service. Provided to fx.
func New(cfg core.Config) (*Service, error) {
	client, err := newS3Client(cfg.R2)
	if err != nil {
		return nil, err
	}
	return &Service{
		client:    client,
		bucket:    cfg.R2.Bucket,
		publicURL: strings.TrimRight(cfg.R2.PublicURL, "/"),
	}, nil
}

// Upload stores bytes and returns the public URL.
func (s *Service) Upload(ctx context.Context, data []byte, contentType, prefix string) (string, error) {
	ext := "bin"
	if parts := strings.SplitN(contentType, "/", 2); len(parts) == 2 {
		ext = extSanitize.ReplaceAllString(strings.ToLower(parts[1]), "")
	}
	key := fmt.Sprintf("%s/%s.%s", prefix, uuid.NewString(), ext)
	_, err := s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(s.bucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(data),
		ContentType: aws.String(contentType),
	})
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%s/%s", s.publicURL, key), nil
}

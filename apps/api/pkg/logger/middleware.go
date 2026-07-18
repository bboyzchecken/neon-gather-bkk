package logger

import (
	"time"

	"github.com/labstack/echo/v4"
	"github.com/sirupsen/logrus"
)

// Middleware logs one line per HTTP request.
func Middleware() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			start := time.Now()
			err := next(c)
			Log.WithFields(logrus.Fields{
				"method": c.Request().Method,
				"path":   c.Request().URL.Path,
				"status": c.Response().Status,
				"dur_ms": time.Since(start).Milliseconds(),
			}).Info("request")
			return err
		}
	}
}

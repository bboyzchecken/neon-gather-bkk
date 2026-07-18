package logger

import (
	"github.com/sirupsen/logrus"
	"neongather/pkg/core"
)

// Log is the shared application logger.
var Log = logrus.New()

func Init(cfg core.Config) {
	if cfg.Environment == "production" {
		Log.SetFormatter(&logrus.JSONFormatter{})
	} else {
		Log.SetFormatter(&logrus.TextFormatter{FullTimestamp: true})
	}
	Log.SetLevel(logrus.InfoLevel)
}

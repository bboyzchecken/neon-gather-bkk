package hashutil

import (
	"crypto/sha256"
	"encoding/hex"
)

func SHA256(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}

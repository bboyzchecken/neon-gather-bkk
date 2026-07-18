package validatorutil

import "github.com/go-playground/validator/v10"

// CustomValidator adapts go-playground/validator to Echo's Validator interface.
type CustomValidator struct {
	V *validator.Validate
}

func New() *CustomValidator {
	return &CustomValidator{V: validator.New()}
}

func (cv *CustomValidator) Validate(i any) error {
	return cv.V.Struct(i)
}

// Package wallet holds pure money math — unit-tested without a DB.
package wallet

import "errors"

// ErrInsufficientFunds is returned when a delta would overdraw a balance.
var ErrInsufficientFunds = errors.New("insufficient funds")

// NextBalance computes the resulting balance, refusing to go negative.
func NextBalance(current, delta int) (int, error) {
	next := current + delta
	if next < 0 {
		return 0, ErrInsufficientFunds
	}
	return next, nil
}

// SettleSale returns the exactly zero-sum deltas for a marketplace sale.
func SettleSale(price int) (buyerDelta, sellerDelta int) {
	return -price, price
}

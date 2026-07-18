package wallet

import "testing"

func TestNextBalance(t *testing.T) {
	if b, _ := NextBalance(100, 50); b != 150 {
		t.Fatalf("credit: want 150 got %d", b)
	}
	if b, _ := NextBalance(100, -30); b != 70 {
		t.Fatalf("debit: want 70 got %d", b)
	}
	if _, err := NextBalance(10, -20); err != ErrInsufficientFunds {
		t.Fatalf("overdraw should fail, got %v", err)
	}
	if _, err := NextBalance(0, -1); err != ErrInsufficientFunds {
		t.Fatalf("overdraw at zero should fail, got %v", err)
	}
}

func TestSettleSaleIsZeroSum(t *testing.T) {
	buyer, seller := SettleSale(250)
	if buyer != -250 || seller != 250 {
		t.Fatalf("want (-250,250) got (%d,%d)", buyer, seller)
	}
	if buyer+seller != 0 {
		t.Fatalf("sale not zero-sum: %d", buyer+seller)
	}
}

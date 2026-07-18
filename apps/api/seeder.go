package main

import (
	"fmt"

	"gorm.io/gorm"

	"neongather/pkg/core"
	"neongather/pkg/handlers/api/request"
	"neongather/pkg/models"
	walletstore "neongather/pkg/store/wallet"
)

// Seed populates mock data for testing. Idempotent: safe to run repeatedly.
func Seed(d *gorm.DB, cfg core.Config) error {
	wallet := walletstore.New(d)

	if err := seedPlots(d); err != nil {
		return err
	}
	if err := seedTables(d); err != nil {
		return err
	}
	if err := seedMarketBot(d, wallet); err != nil {
		return err
	}
	if err := seedDemoPlayer(d, wallet, cfg); err != nil {
		return err
	}
	return nil
}

func seedPlots(d *gorm.DB) error {
	var count int64
	d.Model(&models.Plot{}).Count(&count)
	if count > 0 {
		return nil
	}
	facades := []string{models.FacadeCafe, models.FacadeVintage, models.FacadeStreetfood}
	i := 0
	for gy := 0; gy < 2; gy++ {
		for gx := 0; gx < 3; gx++ {
			i++
			p := models.Plot{
				Code:           fmt.Sprintf("A-%02d", i),
				GridX:          2 + gx*6,
				GridY:          2 + gy*7,
				WidthTiles:     4,
				HeightTiles:    4,
				Status:         models.PlotVacant,
				RentPrice:      200,
				FacadeTemplate: facades[(i-1)%len(facades)],
			}
			if err := d.Create(&p).Error; err != nil {
				return err
			}
		}
	}
	return nil
}

func seedTables(d *gorm.DB) error {
	var count int64
	d.Model(&models.DiningTable{}).Count(&count)
	if count > 0 {
		return nil
	}
	for i := 1; i <= 4; i++ {
		t := models.DiningTable{
			Code:  fmt.Sprintf("T-%02d", i),
			GridX: 4 + i*2,
			GridY: 16,
			State: models.TableEmpty,
		}
		if err := d.Create(&t).Error; err != nil {
			return err
		}
	}
	return nil
}

func seedMarketBot(d *gorm.DB, wallet models.WalletStore) error {
	const email = "market@neon.gg"
	var existing models.User
	if err := d.First(&existing, "email = ?", email).Error; err == nil {
		return nil
	}
	e := email
	bot := models.User{Email: &e, DisplayName: "Avenue Market", Role: models.RolePlayer, Password: mustHash("not-loginable")}
	if err := d.Create(&bot).Error; err != nil {
		return err
	}
	if _, err := wallet.Credit(bot.ID, models.LedgerAdminAdjust, 5000, "seed market bot"); err != nil {
		return err
	}
	listings := []struct {
		name  string
		cat   string
		price int
	}{
		{"Iced Thai Tea", models.CategoryDrink, 25},
		{"Cold Brew Coffee", models.CategoryDrink, 35},
		{"Pad Thai Plate", models.CategoryFood, 45},
		{"Monstera in Pot", models.CategoryDecor, 120},
		{"Teak Bar Stool", models.CategoryDecor, 180},
		{"Woven Basket", models.CategoryMaterial, 60},
	}
	for _, li := range listings {
		it := models.Item{Name: li.name, Category: li.cat, Price: li.price, OwnerID: bot.ID, ListedForSale: true}
		if err := d.Create(&it).Error; err != nil {
			return err
		}
	}
	return nil
}

func seedDemoPlayer(d *gorm.DB, wallet models.WalletStore, cfg core.Config) error {
	const email = "demo@neon.gg"
	var existing models.User
	if err := d.First(&existing, "email = ?", email).Error; err == nil {
		return nil
	}
	e := email
	demo := models.User{Email: &e, DisplayName: "Demo Player", Role: models.RolePlayer, Password: mustHash("demo1234")}
	if err := d.Create(&demo).Error; err != nil {
		return err
	}
	if _, err := wallet.Credit(demo.ID, models.LedgerSignupBonus, cfg.SignupBonus, "seed signup bonus"); err != nil {
		return err
	}
	return nil
}

func mustHash(pw string) string {
	h, err := request.HashPassword(pw)
	if err != nil {
		panic(err)
	}
	return h
}

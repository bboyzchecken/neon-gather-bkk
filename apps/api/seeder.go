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
		thumb string
	}{
		{"Iced Thai Tea", models.CategoryDrink, 25, "/assets/icons/icon_drink_thai_tea.png"},
		{"Cold Brew Coffee", models.CategoryDrink, 35, "/assets/icons/icon_drink_coffee_iced.png"},
		{"Signature Cocktail", models.CategoryDrink, 55, "/assets/icons/icon_drink_cocktail.png"},
		{"Draft Beer", models.CategoryDrink, 40, "/assets/icons/icon_drink_beer.png"},
		{"Mango Smoothie", models.CategoryDrink, 45, "/assets/icons/icon_drink_smoothie.png"},
		{"Teal Teapot Set", models.CategoryDrink, 65, "/assets/icons/icon_drink_teapot.png"},
		{"Pad Thai Plate", models.CategoryFood, 45, "/assets/icons/icon_food_noodles_padthai.png"},
		{"Fried Rice Special", models.CategoryFood, 40, "/assets/icons/icon_food_fried_rice.png"},
		{"Grilled Skewers", models.CategoryFood, 35, "/assets/icons/icon_food_skewers.png"},
		{"Slice of Cake", models.CategoryFood, 30, "/assets/icons/icon_food_cake.png"},
		{"Monstera in Pot", models.CategoryDecor, 120, "/assets/icons/icon_decor_plant_monstera.png"},
		{"Teak Bar Stool", models.CategoryDecor, 180, "/assets/icons/icon_decor_stool_bar.png"},
		{"Woven Basket", models.CategoryMaterial, 60, "/assets/icons/icon_material_basket_woven.png"},
	}
	for _, li := range listings {
		thumb := li.thumb
		it := models.Item{Name: li.name, Category: li.cat, Price: li.price, OwnerID: bot.ID, ListedForSale: true, ThumbnailURL: &thumb}
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

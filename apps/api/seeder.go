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
	if err := seedQuests(d); err != nil {
		return err
	}
	if err := seedVending(d); err != nil {
		return err
	}
	return nil
}

// seedQuests inserts the Phase 1 quest content (idempotent on quest code).
func seedQuests(d *gorm.DB) error {
	str := func(s string) *string { return &s }
	quests := []models.Quest{
		// main quests (one-shot onboarding arc)
		{Code: "main_first_shop", Type: models.QuestMain, Title: "Open Your First Shop", Description: "Rent a plot on the avenue", Event: models.EventPlotRent, Target: 1, RewardCoins: 150, SortOrder: 1},
		{Code: "main_first_item", Type: models.QuestMain, Title: "Stock the Shelves", Description: "Create 3 items to sell", Event: models.EventItemCreate, Target: 3, RewardCoins: 100, SortOrder: 2},
		{Code: "main_first_sale", Type: models.QuestMain, Title: "First Customer", Description: "Sell an item to the vendor counter", Event: models.EventVendorSell, Target: 1, RewardCoins: 100, SortOrder: 3},
		{Code: "main_first_photo", Type: models.QuestMain, Title: "Say Cheese", Description: "Take a photo in the photo booth", Event: models.EventPhotoTaken, Target: 1, RewardCoins: 80, SortOrder: 4},
		// job quests (repeatable growth per job, non-periodic)
		{Code: "job_vendor_sales", Type: models.QuestJob, JobType: str(models.JobVendor), Title: "Counter Rhythm", Description: "Complete 10 vendor sales", Event: models.EventVendorSell, Target: 10, RewardCoins: 200, RewardJobXP: 120, SortOrder: 10},
		{Code: "job_merchant_trades", Type: models.QuestJob, JobType: str(models.JobMerchant), Title: "Deal Maker", Description: "Sell 5 items on the marketplace", Event: models.EventMarketSell, Target: 5, RewardCoins: 200, RewardJobXP: 120, SortOrder: 11},
		{Code: "job_crafter_items", Type: models.QuestJob, JobType: str(models.JobCrafter), Title: "Workshop Week", Description: "Create 15 items", Event: models.EventItemCreate, Target: 15, RewardCoins: 200, RewardJobXP: 120, SortOrder: 12},
		{Code: "job_host_tables", Type: models.QuestJob, JobType: str(models.JobHost), Title: "Floor Shift", Description: "Collect 10 tables", Event: models.EventTableCollect, Target: 10, RewardCoins: 200, RewardJobXP: 120, SortOrder: 13},
		{Code: "job_explorer_photos", Type: models.QuestJob, JobType: str(models.JobExplorer), Title: "Avenue Album", Description: "Take 5 photos", Event: models.EventPhotoTaken, Target: 5, RewardCoins: 200, RewardJobXP: 120, SortOrder: 14},
		// daily quests
		{Code: "daily_sell", Type: models.QuestDaily, Title: "Daily Hustle", Description: "Make 3 vendor sales today", Event: models.EventVendorSell, Target: 3, RewardCoins: 60, SortOrder: 20},
		{Code: "daily_collect", Type: models.QuestDaily, Title: "Bus the Tables", Description: "Collect 2 tables today", Event: models.EventTableCollect, Target: 2, RewardCoins: 50, SortOrder: 21},
		{Code: "daily_vending", Type: models.QuestDaily, Title: "Snack Run", Description: "Buy 1 thing from a vending machine", Event: models.EventVendingBuy, Target: 1, RewardCoins: 40, SortOrder: 22},
		{Code: "daily_cheers", Type: models.QuestDaily, Title: "Clink!", Description: "Cheers with another player", Event: models.EventCheers, Target: 1, RewardCoins: 40, SortOrder: 23},
		// weekly quest
		{Code: "weekly_market", Type: models.QuestWeekly, Title: "Trade Week", Description: "Complete 10 marketplace purchases this week", Event: models.EventMarketBuy, Target: 10, RewardCoins: 300, SortOrder: 30},
		// community quest (server-wide weekly goal)
		{Code: "community_orders", Type: models.QuestCommunity, Title: "Avenue Rush", Description: "The whole avenue serves 100 table orders this week", Event: models.EventTableOrder, Target: 100, RewardCoins: 250, SortOrder: 40},
	}
	for _, q := range quests {
		var existing models.Quest
		if err := d.First(&existing, "code = ?", q.Code).Error; err == nil {
			continue
		}
		if err := d.Create(&q).Error; err != nil {
			return err
		}
	}
	return nil
}

// seedVending places one machine near the tables, owned by the market bot.
func seedVending(d *gorm.DB) error {
	var count int64
	d.Model(&models.VendingMachine{}).Count(&count)
	if count > 0 {
		return nil
	}
	var bot models.User
	if err := d.First(&bot, "email = ?", "market@neon.gg").Error; err != nil {
		return err
	}
	// grid (18,16): near the tables row, clear of the bar counter at ~(15.6,16.2)
	m := models.VendingMachine{Code: "V-01", OwnerID: bot.ID, GridX: 18, GridY: 16}
	if err := d.Create(&m).Error; err != nil {
		return err
	}
	str := func(s string) *string { return &s }
	slots := []models.VendingSlot{
		{MachineID: m.ID, ItemName: "Iced Thai Tea", Category: models.CategoryDrink, Price: 30, Stock: 10, ThumbnailURL: str("/assets/icons/icon_drink_thai_tea.png")},
		{MachineID: m.ID, ItemName: "Cold Brew Coffee", Category: models.CategoryDrink, Price: 40, Stock: 10, ThumbnailURL: str("/assets/icons/icon_drink_coffee_iced.png")},
		{MachineID: m.ID, ItemName: "Mango Smoothie", Category: models.CategoryDrink, Price: 50, Stock: 8, ThumbnailURL: str("/assets/icons/icon_drink_smoothie.png")},
		{MachineID: m.ID, ItemName: "Slice of Cake", Category: models.CategoryFood, Price: 35, Stock: 6, ThumbnailURL: str("/assets/icons/icon_food_cake.png")},
	}
	for _, sl := range slots {
		if err := d.Create(&sl).Error; err != nil {
			return err
		}
	}
	return nil
}

// mallLayout is the wall-to-wall shop arrangement (product direction: units
// line the interior walls like a real mall, adjacent units share boundaries).
// Top wall: 4 units flanking the entrance (tiles 10-13). Left wall: 2 units.
var mallLayout = []struct {
	code   string
	gx, gy int
}{
	{"A-01", 2, 1}, {"A-02", 6, 1}, {"A-03", 14, 1}, {"A-04", 18, 1},
	{"A-05", 1, 6}, {"A-06", 1, 10},
}

func seedPlots(d *gorm.DB) error {
	var count int64
	d.Model(&models.Plot{}).Count(&count)
	if count == 0 {
		facades := []string{models.FacadeCafe, models.FacadeVintage, models.FacadeStreetfood}
		for i, slot := range mallLayout {
			p := models.Plot{
				Code:           slot.code,
				GridX:          slot.gx,
				GridY:          slot.gy,
				WidthTiles:     4,
				HeightTiles:    4,
				Status:         models.PlotVacant,
				RentPrice:      200,
				FacadeTemplate: facades[i%len(facades)],
			}
			if err := d.Create(&p).Error; err != nil {
				return err
			}
		}
	}
	return relayoutPlots(d)
}

// relayoutPlots moves existing plots onto the current mall layout by code —
// idempotent, so layout changes reach already-seeded databases.
func relayoutPlots(d *gorm.DB) error {
	for _, slot := range mallLayout {
		if err := d.Model(&models.Plot{}).Where("code = ?", slot.code).
			Updates(map[string]any{"grid_x": slot.gx, "grid_y": slot.gy}).Error; err != nil {
			return err
		}
	}
	return nil
}

func seedTables(d *gorm.DB) error {
	var count int64
	d.Model(&models.DiningTable{}).Count(&count)
	if count == 0 {
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
	}
	return linkTablesToPlots(d)
}

// linkTablesToPlots assigns each unassigned table to a plot so shop-scoped
// systems (coasters, staff wages, order alerts) have a real shop. Tables are
// the food court of the nearest plot column. Idempotent.
func linkTablesToPlots(d *gorm.DB) error {
	var tables []models.DiningTable
	if err := d.Where("plot_id IS NULL").Order("code").Find(&tables).Error; err != nil {
		return err
	}
	if len(tables) == 0 {
		return nil
	}
	var plots []models.Plot
	if err := d.Order("code").Find(&plots).Error; err != nil || len(plots) == 0 {
		return err
	}
	for i := range tables {
		p := plots[i%len(plots)]
		tables[i].PlotID = &p.ID
		if err := d.Save(&tables[i]).Error; err != nil {
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

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
	if err := seedStories(d); err != nil {
		return err
	}
	if err := seedStaffNPC(d); err != nil {
		return err
	}
	return nil
}

// seedStaffNPC creates the first heart-system character with her full
// 10-level reward track (Phase 2 §6). One character only this season —
// schema leaves room for more, no multi-season tooling yet (per the brief).
// All content wholesome/all-ages; Nara is an adult character.
func seedStaffNPC(d *gorm.DB) error {
	var count int64
	d.Model(&models.StaffNPC{}).Count(&count)
	// her "home shop" anchors character coasters (Lv3 reward needs a shop FK)
	var home models.Plot
	homeID := (*string)(nil)
	if err := d.First(&home, "code = ?", "A-01").Error; err == nil {
		homeID = &home.ID
	}
	if count > 0 {
		// keep tunable fields in sync with the current design on reseed
		return d.Model(&models.StaffNPC{}).Where("name = ?", "Nara").
			Updates(map[string]any{"shift_start_hour": 18, "shift_end_hour": 2, "home_shop_id": homeID}).Error
	}
	nara := models.StaffNPC{
		HomeShopID:     homeID,
		Name:           "Nara",
		ArtistCredit:   "concept: BFL gen — final art: guest artist TBD",
		ShiftStartHour: 18,
		ShiftEndHour:   2, // wraps past midnight — the after-last-train crowd is hers
		SignatureMenu:  "Iced Thai Tea",
		Season:         "S1",
		IsActive:       true,
		Bio:            "The evening bartender (28). Remembers every regular's order and claims the espresso machine is haunted — in a friendly way.",
	}
	if err := d.Create(&nara).Error; err != nil {
		return err
	}
	prefs := []models.StaffGiftPref{
		{StaffID: nara.ID, ItemName: "Mango Smoothie", Preference: models.GiftLoved},
		{StaffID: nara.ID, ItemName: "Woven Basket", Preference: models.GiftLoved},
		{StaffID: nara.ID, ItemName: "Slice of Cake", Preference: models.GiftLiked},
		{StaffID: nara.ID, ItemName: "Iced Thai Tea", Preference: models.GiftLiked},
		{StaffID: nara.ID, ItemName: "Draft Beer", Preference: models.GiftDisliked},
	}
	for _, p := range prefs {
		if err := d.Create(&p).Error; err != nil {
			return err
		}
	}
	nodes := []models.StaffStoryNode{
		{StaffID: nara.ID, RequiredLevel: 1, Title: "A Nod Across the Counter", RewardType: "DIALOGUE", StoryText: "Nara starts greeting you by sight. \"Back again? Good. The good stools are by the window.\""},
		{StaffID: nara.ID, RequiredLevel: 2, Title: "She Knows Your Name", RewardType: "DIALOGUE", StoryText: "\"I remember orders before names — occupational habit. But I've got yours now. Both.\""},
		{StaffID: nara.ID, RequiredLevel: 3, Title: "Nara's Coaster", RewardType: "COASTER", RewardRef: "char_nara", StoryText: "She slides a coaster across the counter — her own design. \"Limited run. Don't ask how limited.\""},
		{StaffID: nara.ID, RequiredLevel: 4, Title: "Story: The First Shift", RewardType: "DIALOGUE", StoryText: "\"My first shift, I broke six glasses and the ice machine. The owner said 'good — now you know where everything is.' I stayed for that.\""},
		{StaffID: nara.ID, RequiredLevel: 5, Title: "The Secret Recipe", RewardType: "RECIPE", RewardRef: "Nara's Secret Brew", StoryText: "\"Alright. Cold brew, condensed milk, ONE basil leaf. If you sell it, name it after me — I take royalties in gossip.\""},
		{StaffID: nara.ID, RequiredLevel: 6, Title: "A Little Something", RewardType: "COSMETIC", StoryText: "\"I found this while cleaning the storeroom. It suits your shop more than our shelf.\" (a keepsake for your plot — arriving with the decor system)"},
		{StaffID: nara.ID, RequiredLevel: 7, Title: "Story: Why This Avenue", RewardType: "DIALOGUE", StoryText: "\"I tried three cities before this one. This is the only place where the rain sounds like applause. You've heard it too, right?\"", RefusalText: "\"Not tonight — it's too loud for that story. Ask me on a quiet one.\""},
		{StaffID: nara.ID, RequiredLevel: 8, Title: "A Visit to Your Shop", RewardType: "VISIT", StoryText: "\"You keep talking that place up — fine, I'm coming to see it after shift. First round's on you though.\""},
		{StaffID: nara.ID, RequiredLevel: 9, Title: "Story: The Last Train", RewardType: "TITLE", RewardRef: "Friend of the Bar", StoryText: "\"You know why I like the after-midnight crowd? They're exactly where they mean to be. So am I. So are you.\" — title unlocked: Friend of the Bar"},
		{StaffID: nara.ID, RequiredLevel: 10, Title: "A Photo Together", RewardType: "PHOTO", RewardRef: "heart_special", StoryText: "\"One photo. ONE. And I pick the backdrop.\" (special portrait art arrives with the guest artist — the booth will remember this unlock)"},
	}
	for _, n := range nodes {
		if err := d.Create(&n).Error; err != nil {
			return err
		}
	}
	return nil
}

// seedStories inserts the bartender story book (idempotent on code).
// Wholesome, all-ages, no real people or brands.
func seedStories(d *gorm.DB) error {
	stories := []models.BartenderStory{
		{Code: "story_first_pour", Title: "The First Pour", Body: "They say the first drink ever served on this avenue was poured with shaking hands and too much ice. The customer smiled anyway. That smile paid the first month's rent.", SortOrder: 1},
		{Code: "story_rain_night", Title: "Rainy Season", Body: "When the rain hits the skylight just right, the whole hall sounds like applause. The regulars stop talking for a minute, every time. Nobody planned that tradition — it just happens.", SortOrder: 2},
		{Code: "story_lost_coaster", Title: "The Lost Coaster", Body: "A customer once traded their rarest coaster for a stranger's umbrella on a stormy night. They both still come here. They still argue about who got the better deal.", SortOrder: 3},
		{Code: "story_vending_ghost", Title: "The Generous Machine", Body: "V-01 once dropped two drinks for one coin. The owner checked the logs for a week and found nothing. Some machines are just kind, I suppose.", SortOrder: 4},
		{Code: "story_photo_wall", Title: "Say Cheese", Body: "The photo booth curtain has heard more secrets than I have. It keeps them better, too — everything comes out as a smile.", SortOrder: 5},
		{Code: "story_first_regular", Title: "Twenty Cups", Body: "Our first regular ordered the same thing twenty times before I learned their name. Turns out that IS how you learn a name properly — one cup at a time.", SortOrder: 6},
		{Code: "story_midnight_sweep", Title: "Midnight Sweep", Body: "After midnight, the bot sweeps the floor in perfect little squares. I swear it hums. Don't tell the engineers.", LateNightOnly: true, SortOrder: 7},
		{Code: "story_last_train", Title: "After the Last Train", Body: "The ones who stay past the last train aren't stuck here. They're exactly where they mean to be. That's the whole secret of this place.", LateNightOnly: true, SortOrder: 8},
	}
	for _, st := range stories {
		var existing models.BartenderStory
		if err := d.First(&existing, "code = ?", st.Code).Error; err == nil {
			continue
		}
		if err := d.Create(&st).Error; err != nil {
			return err
		}
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
		{Code: "daily_chill", Type: models.QuestDaily, Title: "Just Chill", Description: "Relax at the bar zone for 5 minutes", Event: models.EventBarIdle, Target: 5, RewardCoins: 50, SortOrder: 24},
		{Code: "daily_gacha", Type: models.QuestDaily, Title: "Lucky Capsule", Description: "Spin the gachapon once", Event: models.EventGachaSpin, Target: 1, RewardCoins: 30, SortOrder: 25},
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

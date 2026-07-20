/** Texture manifest — keys -> files under public/assets (drop-in replaceable). */
export const TEXTURES: Record<string, string> = {
  // facades
  facade_empty: 'world/env_facade_empty_01.png',
  facade_a: 'world/env_facade_a_01.png',
  facade_b: 'world/env_facade_b_01.png',
  facade_c: 'world/env_facade_c_01.png',
  // props
  table_round: 'world/prop_table_round_01.png',
  table_bar: 'world/prop_table_bar_01.png',
  counter_bar: 'world/prop_counter_bar_01.png',
  plant_monstera: 'world/prop_plant_monstera_01.png',
  plant_banana: 'world/prop_plant_banana_01.png',
  plant_fern: 'world/prop_plant_fern_01.png',
  // floors
  floor_terracotta: 'floors/env_floor_terracotta_01.png',
  floor_teak: 'floors/env_floor_teak_01.png',
  floor_concrete: 'floors/env_floor_concrete_01.png',
  // Phase 1 props
  vending: 'world/prop_vending_01.png',
  photobooth: 'world/prop_photobooth_01.png',
  // Phase 2
  cabinet: 'world/prop_cabinet_01.png',
  coaster_blank: 'coasters/coaster_blank_01.png',
  coaster_opening: 'coasters/coaster_opening_01.png',
  sofa: 'world/prop_sofa_01.png',
  rug: 'world/prop_rug_01.png',
  gacha: 'world/prop_gacha_01.png',
  // Phase 3
  elevator: 'world/env_elevator_01.png',
  stairs: 'world/env_stairs_01.png',
  // Phase 3b — Seenspace-style night hall
  table_communal: 'world/prop_table_communal_01.png',
  lamp_rattan: 'world/prop_lamp_rattan_01.png',
  tree_interior: 'world/prop_tree_interior_01.png',
  // Phase 3c — D3.5 Sims-open surroundings (soi anchor set)
  backdrop_shophouse_a: 'world/env_backdrop_shophouse_a_01.png',
  backdrop_shophouse_b: 'world/env_backdrop_shophouse_b_01.png',
  backdrop_tower: 'world/env_backdrop_tower_01.png',
  tree_street: 'world/prop_tree_street_01.png',
  lamp_street: 'world/prop_lamp_street_01.png',
  planter_row: 'world/prop_planter_row_01.png',
  scooter: 'world/prop_scooter_01.png',
  floor_asphalt: 'floors/env_floor_asphalt_01.png',
  floor_pavers: 'floors/env_floor_pavers_01.png',
  floor_grass: 'floors/env_floor_grass_01.png',
};

/** Map a plot facade template to its texture key. */
export function facadeKey(template: string, vacant: boolean): string {
  if (vacant) return 'facade_empty';
  switch (template) {
    case 'VINTAGE':
      return 'facade_b';
    case 'STREETFOOD':
      return 'facade_c';
    default:
      return 'facade_a';
  }
}

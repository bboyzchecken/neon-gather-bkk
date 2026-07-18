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

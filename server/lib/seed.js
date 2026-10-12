// Starter catalogue. Names and copy are placeholders: no prices, certifications or technical specifications are
// implied until the shop sets them (admin page, or edit `price_bdt` / `stock` below).
//   price_bdt: null → "price on request" (the shop confirms the price by phone before dispatch)
//   stock:     null → made to order / not tracked
// Used (1) to seed the database and (2) as the live catalogue when no database is configured yet.
const P = (category, slug, name, description, extra = {}) => ({ category, slug, name, description, price_bdt: null, stock: null, images: [], featured: false, active: true, is_demo: true, ...extra });

export const PRODUCT_SEED = [
  P('pendant', 'atelier-pendant-i', 'Atelier Pendant I', 'A single dome of opal glass on a braided cord, gathering light into one warm pool.', { featured: true }),
  P('pendant', 'atelier-pendant-ii', 'Atelier Pendant II', 'A shallower dome for low ceilings and long dining tables.'),
  P('pendant', 'gallery-pendant', 'Gallery Pendant', 'A tall cord drop that lets the shade hang where the light is needed.'),
  P('sconce', 'tulip-sconce', 'Tulip Sconce', 'A fluted glass tulip on a curved brass arm; a soft wash up the wall.', { featured: true }),
  P('sconce', 'hall-sconce', 'Hall Sconce', 'A slim back-plate sconce for corridors and staircases.'),
  P('sconce', 'bedside-sconce', 'Bedside Sconce', 'A compact arm that frees up the bedside table.'),
  P('table', 'sideboard-lamp', 'Sideboard Lamp', 'Amber glass baluster, brass foot and a pleated linen shade.', { featured: true }),
  P('table', 'reading-lamp', 'Reading Lamp', 'A narrow brass column with a directional shade for the armchair.'),
  P('table', 'console-lamp', 'Console Lamp', 'A low, wide lamp that sits happily under a mirror.'),
  P('floor', 'column-floor-lamp', 'Column Floor Lamp', 'A slender brass pole under a drum shade; warms a corner of the room.', { featured: true }),
  P('floor', 'arc-floor-lamp', 'Arc Floor Lamp', 'A long reaching arm that lights a sofa without a ceiling point.'),
  P('floor', 'tripod-floor-lamp', 'Tripod Floor Lamp', 'Walnut legs and a linen shade, easy to move from room to room.'),
  P('ceiling', 'square-ceiling-fixture', 'Square Ceiling Fixture', 'Frosted glass in a brass frame, the kind a house is remembered by.'),
  P('ceiling', 'flush-ceiling-fixture', 'Flush Ceiling Fixture', 'A low-profile version for hallways and small rooms.'),
  P('ceiling', 'lantern-ceiling-fixture', 'Lantern Ceiling Fixture', 'A glazed lantern frame with a soft, even glow.'),
].map((p, i) => ({ ...p, sort: i }));

export const CATEGORIES = ['pendant', 'sconce', 'table', 'floor', 'ceiling'];
export const CATEGORY_LABELS = { pendant: 'Pendant lights', sconce: 'Wall sconces', table: 'Table lamps', floor: 'Floor lamps', ceiling: 'Ceiling fixtures' };

/** the photo shown for a product when it has no uploaded images */
export const defaultImage = (slug) => `/photos/p-${slug}.webp`;

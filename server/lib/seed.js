// Demonstration catalogue. Names and copy are placeholders: no prices, certifications or technical specifications.
// Used (1) to seed the database and (2) as the live catalogue when no database is configured yet.
export const PRODUCT_SEED = [
  ['pendant', 'atelier-pendant-i', 'Atelier Pendant I', 'A single dome of opal glass on a braided cord, gathering light into one warm pool.'],
  ['pendant', 'atelier-pendant-ii', 'Atelier Pendant II', 'A shallower dome for low ceilings and long dining tables.'],
  ['pendant', 'gallery-pendant', 'Gallery Pendant', 'A tall cord drop that lets the shade hang where the light is needed.'],
  ['sconce', 'tulip-sconce', 'Tulip Sconce', 'A fluted glass tulip on a curved brass arm; a soft wash up the wall.'],
  ['sconce', 'hall-sconce', 'Hall Sconce', 'A slim back-plate sconce for corridors and staircases.'],
  ['sconce', 'bedside-sconce', 'Bedside Sconce', 'A compact arm that frees up the bedside table.'],
  ['table', 'sideboard-lamp', 'Sideboard Lamp', 'Amber glass baluster, brass foot and a pleated linen shade.'],
  ['table', 'reading-lamp', 'Reading Lamp', 'A narrow brass column with a directional shade for the armchair.'],
  ['table', 'console-lamp', 'Console Lamp', 'A low, wide lamp that sits happily under a mirror.'],
  ['floor', 'column-floor-lamp', 'Column Floor Lamp', 'A slender brass pole under a drum shade; warms a corner of the room.'],
  ['floor', 'arc-floor-lamp', 'Arc Floor Lamp', 'A long reaching arm that lights a sofa without a ceiling point.'],
  ['floor', 'tripod-floor-lamp', 'Tripod Floor Lamp', 'Walnut legs and a linen shade, easy to move from room to room.'],
  ['ceiling', 'square-ceiling-fixture', 'Square Ceiling Fixture', 'Frosted glass in a brass frame, the kind a house is remembered by.'],
  ['ceiling', 'flush-ceiling-fixture', 'Flush Ceiling Fixture', 'A low-profile version for hallways and small rooms.'],
  ['ceiling', 'lantern-ceiling-fixture', 'Lantern Ceiling Fixture', 'A glazed lantern frame with a soft, even glow.'],
].map(([category, slug, name, description], i) => ({ category, slug, name, description, sort: i, is_demo: true }));

export const CATEGORIES = ['pendant', 'sconce', 'table', 'floor', 'ceiling'];

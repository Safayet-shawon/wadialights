// Easy-to-replace brand + catalogue data. All of it is demonstration content.
export const BRAND = {
  name: 'WADIA',
};

// kind → procedural model in src/scene/lamps.js (used for plates and the 3D inspector)
export const PRODUCTS = [
  {
    kind: 'pendant', plate: 'Plate I', title: 'Pendant lights',
    blurb: 'Suspended pieces that gather the light into a single warm pool over a table or a hall.',
    inspect: 'The pendant',
  },
  {
    kind: 'sconce', plate: 'Plate II', title: 'Wall sconces',
    blurb: 'Quiet companions for a wall, throwing a soft wash that shows off plaster and panelling.',
    inspect: 'The wall sconce',
  },
  {
    kind: 'table', plate: 'Plate III', title: 'Table lamps',
    blurb: 'Glass, brass and linen, made for the sideboard and the reading chair.',
    inspect: 'The table lamp',
  },
  {
    kind: 'floor', plate: 'Plate IV', title: 'Floor lamps',
    blurb: 'A slender column of brass that warms a corner and draws the eye across the room.',
    inspect: 'The floor lamp',
  },
  {
    kind: 'ceiling', plate: 'Plate V', title: 'Vintage ceiling fixtures',
    blurb: 'Square, frosted and framed in brass. The kind of fixture a house is remembered by.',
    inspect: 'The ceiling fixture',
  },
];

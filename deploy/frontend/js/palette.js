/*
  Colours of things in the world (gills, spore prints), shared by the form's
  swatches and the 3D scene, so the colour you pick is the colour you see.

  These are content, not interface colours: a "brown" gill should look brown.
  The interface itself uses only the cobalt accent and the status colours from
  styles.css.
*/

export const MUSHROOM_COLOURS = {
  black:  '#2b2725',
  brown:  '#7b4b2c',
  buff:   '#e1caa0',
  gray:   '#8f9197',
  green:  '#5d8f51',
  orange: '#e07b34',
  pink:   '#e8a6b6',
  purple: '#7c53a3',
  red:    '#bd3c30',
  white:  '#f3f1ea',
  yellow: '#e6c64b',
};

/* Colour of the little dot drawn on a chosen swatch: dark on light swatches,
   light on dark ones, so the "selected" mark is always visible. */
export function dotFor(name) {
  return ['buff', 'white', 'yellow', 'pink'].includes(name) ? '#1a1a1a' : '#ffffff';
}

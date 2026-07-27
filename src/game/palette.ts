/**
 * The colours a button and its phase blocks share. A group is read by colour, so
 * these are kept clear of everything else on screen: the device pads (blue, violet
 * and rose), the crate's dull brown, the yellow body and its cyan former selves.
 */
export const GROUP_COLOURS = [0x3ddc84, 0xffc93d, 0xff5cd6, 0x2ee6c8];

export function groupColour(group: number): number {
  return GROUP_COLOURS[((group % GROUP_COLOURS.length) + GROUP_COLOURS.length) % GROUP_COLOURS.length];
}

/** Blends two packed colours. */
export function mixColor(from: number, to: number, k: number): number {
  const mix = (shift: number): number => {
    const a = (from >> shift) & 0xff;
    const b = (to >> shift) & 0xff;
    return Math.round(a + (b - a) * k) << shift;
  };
  return mix(16) | mix(8) | mix(0);
}

/** A darker version of a colour, for the shadowed edge of a lit thing. */
export function shade(color: number, k: number): number {
  return mixColor(color, 0x000000, k);
}

/** A lighter version of a colour, for a highlight. */
export function tint(color: number, k: number): number {
  return mixColor(color, 0xffffff, k);
}

// A minimal PMTiles v3 header with the given bounds and centre, enough for
// map-config's reader: the magic, the version, and the fields from byte 100.
export function pmtilesHeader(
  bounds: [number, number, number, number],
  center: [number, number] = [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2],
  centerZoom = 9
): Uint8Array {
  const bytes = new Uint8Array(127);
  bytes.set(new TextEncoder().encode("PMTiles"), 0);
  bytes[7] = 3;
  const view = new DataView(bytes.buffer);
  bytes[100] = 0;
  bytes[101] = 14;
  bounds.forEach((v, i) => view.setInt32(102 + i * 4, Math.round(v * 1e7), true));
  bytes[118] = centerZoom;
  view.setInt32(119, Math.round(center[0] * 1e7), true);
  view.setInt32(123, Math.round(center[1] * 1e7), true);
  return bytes;
}

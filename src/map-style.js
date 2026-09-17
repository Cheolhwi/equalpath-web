import baseStyle from "./base-map.json";
export const palette = {
  light: {
    bg: "#f0efe8",
    land: "#eeede5",
    park: "#dce3ce",
    water: "#cbdad5",
    road: "#fffefa",
    edge: "#d6d4c9",
    ink: "#737b6c",
    building: "#e3e2d7",
    rail: "#b7b39f",
  },
  dark: {
    bg: "#252e29",
    land: "#29362e",
    park: "#324638",
    water: "#253c3b",
    road: "#46594b",
    edge: "#354639",
    ink: "#b8c6af",
    building: "#354336",
    rail: "#8f9980",
  },
};
export function makeStyle(theme = "light", labels = true) {
  const p = palette[theme];
  const layers = structuredClone(baseStyle.layers).filter(
    (l) =>
      l.type !== "fill-extrusion" &&
      l.type !== "raster" &&
      !/shield|airport/.test(l.id),
  );
  for (const l of layers) {
    const id = l.id;
    l.paint ||= {};
    l.layout ||= {};
    if (l.type === "background") l.paint["background-color"] = p.bg;
    if (l.type === "fill") {
      l.paint["fill-color"] = /water/.test(id)
        ? p.water
        : /park|wood/.test(id)
          ? p.park
          : /building/.test(id)
            ? p.building
            : p.land;
      if (/building/.test(id)) {
        l.paint["fill-outline-color"] = p.building;
        l.paint["fill-opacity"] = 0.3;
      }
    }
    if (l.type === "line") {
      l.paint["line-color"] = /water/.test(id)
        ? p.water
        : /railway/.test(id)
          ? p.rail
          : /casing|boundary|subtle/.test(id)
            ? p.edge
            : p.road;
      if (/railway/.test(id)) l.paint["line-opacity"] = 0.35;
      if (/boundary/.test(id)) l.paint["line-opacity"] = 0.35;
    }
    if (l.type === "symbol") {
      for (const key of Object.keys(l.layout))
        if (key.startsWith("icon-")) delete l.layout[key];
      l.layout.visibility = labels ? "visible" : "none";
      l.layout["text-field"] = [
        "coalesce",
        ["get", "name:latin"],
        ["get", "name_en"],
        ["get", "name"],
      ];
      l.layout["text-font"] = ["Noto Sans Regular"];
      l.paint["text-color"] = p.ink;
      l.paint["text-halo-color"] = p.bg;
      l.paint["text-halo-width"] = 1.3;
      l.paint["text-opacity"] = /highway/.test(id) ? 0.65 : 0.88;
      // Keep neighbourhood names useful; minor place labels arrive when zoomed in.
      if (/poi|housenumber/.test(id)) l.minzoom = Math.max(l.minzoom ?? 0, 15);
    }
  }
  return {
    version: 8,
    name: "EqualPath / Flat childcare map",
    glyphs: baseStyle.glyphs,
    sources: { openmaptiles: baseStyle.sources.openmaptiles },
    layers,
  };
}

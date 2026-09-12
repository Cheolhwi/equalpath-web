import baseStyle from "./base-map.json";
export const palette = {
  light: {
    bg: "#e8e5e1",
    land: "#e1ded7",
    park: "#d1d6c6",
    water: "#b8c8c7",
    road: "#faf8f3",
    edge: "#bdb9b0",
    ink: "#66675f",
    building: "#d8d4ca",
    rail: "#a28b71",
  },
  dark: {
    bg: "#202c30",
    land: "#28353a",
    park: "#2d403b",
    water: "#17262c",
    road: "#536268",
    edge: "#334349",
    ink: "#b4bfbc",
    building: "#344449",
    rail: "#ad9574",
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
        l.paint["fill-opacity"] = 0.45;
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
      if (/railway/.test(id)) l.paint["line-opacity"] = 0.5;
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
      l.paint["text-opacity"] = /highway/.test(id) ? 0.75 : 0.9;
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

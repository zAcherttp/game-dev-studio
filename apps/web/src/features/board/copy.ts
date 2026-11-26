export const boardCopy = {
  brand: "Dev studio",
  canvasLabel: (studio: string) => `Node map of the ${studio} studio`,
  composing: "Rendering the mix…",
  mixLoop: (asset: string) => `${asset}, every picked layer together`,
  noPicks: "No layer picked yet",
  notInMix: "not in mix",
  openCompose: (asset: string) =>
    `Compose the ${asset} mix: turn layers on and off`,
  fit: "Fit",
  hint: "Drag to pan, wheel to zoom, open a layer to pick",
  noPick: "no pick yet",
  title: (studio: string) => `${studio} studio board`,
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
};

export const composeCopy = {
  close: "Close",
  dialog: (asset: string) => `Compose ${asset}`,
  empty: "Turn on at least one picked layer.",
  layers: "Layers in this view",
  noPick: "no pick",
  rendering: "Rendering…",
};

export const switcherCopy = {
  button: (title: string) => `${title} ▾`,
  empty: "No asset matches.",
  filter: "Filter assets",
  filterPlaceholder: "type to filter",
  label: "Assets in this studio",
  picks: (count: number) => (count === 1 ? "1 pick" : `${count} picks`),
};

export const pickerCopy = {
  axis: "More along",
  axisPlaceholder: "an axis, such as colour or timing",
  beat: (beat: string) => `held at ${beat}`,
  close: "Close",
  dialog: (layer: string) => `${layer} variants`,
  history: (count: number) =>
    count === 1 ? "1 earlier pick" : `${count} earlier picks`,
  loop: (label: string) => `${label} loop`,
  note: "Pick note",
  notePlaceholder: "what you like about it, or what to keep",
  pick: (label: string) => `Pick ${label}`,
  alone: "Alone",
  inMix: "In the mix",
  reference: "Reference",
  rendering: (label: string) => `Rendering ${label}…`,
  roundButton: "Ask for a round",
  roundNote: "Round note",
  still: (label: string, beat: string) => `${label} at the ${beat} beat`,
  sync: (beat: string, period: number) =>
    `Loops restart together; every clip meets at ${beat} (${Math.round(period)} ms cycle)`,
};

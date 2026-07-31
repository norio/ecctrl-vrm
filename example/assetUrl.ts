/** Resolves a public/ asset against Vite's base path, so builds served from a
 *  subpath (e.g. GitHub Pages /ecctrl-vrm/) find their assets. */
export const assetUrl = (name: string) => `${import.meta.env.BASE_URL}${name}`;

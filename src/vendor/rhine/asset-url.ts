/** EqualPath hosts the upstream model files without a separate model manifest. */
export const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\//, "")}`;

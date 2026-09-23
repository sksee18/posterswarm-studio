export type LibraryImage = {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
  collectionIds: string[];
};

export type LibraryCollection = { id: string; name: string };

export type ImageLibrary = {
  images: LibraryImage[];
  collections: LibraryCollection[];
};

export function mergeImageLibrary(
  current: ImageLibrary,
  added: ImageLibrary,
): ImageLibrary {
  const images = new Map(current.images.map((image) => [image.id, image]));
  for (const image of added.images) {
    const existing = images.get(image.id);
    images.set(image.id, existing ? {
      ...image,
      collectionIds: [...new Set([...existing.collectionIds, ...image.collectionIds])],
    } : image);
  }
  const collections = new Map(
    current.collections.map((collection) => [collection.id, collection]),
  );
  for (const collection of added.collections)
    collections.set(collection.id, collection);
  return { images: [...images.values()], collections: [...collections.values()] };
}

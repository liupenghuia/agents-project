function normalizeMarketItem(item, resolveMediaUrl) {
  const images = (item.images || []).map((image) => ({ ...image, url: resolveMediaUrl(image.url) }));
  return {
    ...item,
    images,
    ...(item.coverImage ? { coverImage: resolveMediaUrl(item.coverImage) } : {}),
  };
}

function mergeMarketItems(current, incoming) {
  const items = new Map(current.map((item) => [item.id, item]));
  incoming.forEach((item) => items.set(item.id, item));
  return Array.from(items.values());
}

module.exports = { mergeMarketItems, normalizeMarketItem };

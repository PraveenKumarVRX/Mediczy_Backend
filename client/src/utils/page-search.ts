export function rankPageSearch<T extends { label: string; keywords: string[] }>(items: T[], query: string): T[] {
  const term = query.trim().toLowerCase();
  const rank = (item: T) => item.label.toLowerCase() === term ? 0 : item.label.toLowerCase().startsWith(term) ? 1 : item.label.toLowerCase().includes(term) ? 2 : 3;
  return items.filter(item => !term || item.label.toLowerCase().includes(term) || item.keywords.some(key => key.toLowerCase().startsWith(term)))
    .sort((a, b) => rank(a) - rank(b));
}

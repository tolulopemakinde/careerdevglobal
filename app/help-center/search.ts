type HelpGroup = { title: string; items: string[][] };

export function filterHelpGroups<T extends HelpGroup>(groups: T[], query: string): T[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return groups;
  return groups.map((group) => ({
    ...group,
    items: group.items.filter(([question, answer]) => {
      const text = `${group.title} ${question} ${answer}`.toLocaleLowerCase();
      return terms.every((term) => text.includes(term));
    }),
  })).filter((group) => group.items.length > 0);
}

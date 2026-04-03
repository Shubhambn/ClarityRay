export function formatDateTime(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

export function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

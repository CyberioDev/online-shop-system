export async function confirm(title: string, message: string, _confirmLabel: string) {
  return window.confirm(`${title}\n\n${message}`);
}

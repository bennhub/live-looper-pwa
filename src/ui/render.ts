// Small diff-by-id DOM update helpers - no vdom. Every setter is a no-op
// when the value is already correct, so re-render passes stay cheap and
// never glitch things like a mid-drag range input or a focused field.

export function setText(el: Element | null | undefined, text: string): void {
  if (el && el.textContent !== text) el.textContent = text;
}

export function toggleClass(el: Element | null | undefined, className: string, on: boolean): void {
  el?.classList.toggle(className, on);
}

type Disableable = HTMLButtonElement | HTMLInputElement | HTMLSelectElement;

export function setDisabled(el: Disableable | null | undefined, disabled: boolean): void {
  if (el && el.disabled !== disabled) el.disabled = disabled;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) {
    node.append(child);
  }
  return node;
}

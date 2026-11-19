export interface SwitchControlOptions {
  checked: boolean;
  label: string;
  disabled?: boolean;
  className?: string;
  onChange?: (checked: boolean) => void;
}

/** Updates a switch created by `createSwitchControl` without firing its change handler. */
export function setSwitchChecked(button: HTMLButtonElement, checked: boolean): void {
  button.classList.toggle('on', checked);
  button.setAttribute('aria-checked', String(checked));
}

/** Shared accessible switch used for independent boolean settings. */
export function createSwitchControl(options: SwitchControlOptions): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = ['settings-toggle', 'app-switch', options.className].filter(Boolean).join(' ');
  button.setAttribute('role', 'switch');
  button.setAttribute('aria-label', options.label);
  button.disabled = !!options.disabled;

  setSwitchChecked(button, options.checked);
  button.addEventListener('click', () => {
    const checked = button.getAttribute('aria-checked') !== 'true';
    setSwitchChecked(button, checked);
    options.onChange?.(checked);
  });
  return button;
}

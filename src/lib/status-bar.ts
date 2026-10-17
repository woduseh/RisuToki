import { useAppStore } from '../stores/app-store';
import type { StatusOptions } from '../stores/app-store';

export function setStatus(text: string, options: StatusOptions = {}): void {
  useAppStore().setStatus(text, options);
}

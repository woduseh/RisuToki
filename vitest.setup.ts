import { afterEach } from 'vitest';

afterEach(() => {
  if (typeof document !== 'undefined') {
    document.head.innerHTML = '';
    document.body.className = '';
    document.body.innerHTML = '';
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.clear();
  }
});

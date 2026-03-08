import { afterEach } from 'vitest';

afterEach(() => {
  document.head.innerHTML = '';
  document.body.className = '';
  document.body.innerHTML = '';
  localStorage.clear();
});

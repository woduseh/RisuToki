import assert from 'node:assert/strict';
import { createPopoutPayloadStore } from '../src/lib/popout-payload-store';

async function main() {
  {
    const store = createPopoutPayloadStore();
    const requestId = store.prepare('editor', { label: 'A' });
    const data = await store.waitFor('editor', requestId);
    assert.deepEqual(data, { label: 'A' });
  }

  {
    const store = createPopoutPayloadStore({ timeoutMs: 50 });
    const missing = await store.waitFor('preview', 'preview-1');
    assert.equal(missing, null);

    const requestId = store.prepare('preview', { name: 'Fresh' });
    const data = await store.waitFor('preview', requestId);
    assert.deepEqual(data, { name: 'Fresh' });
  }

  {
    const store = createPopoutPayloadStore({ timeoutMs: 10 });
    const requestId = store.prepare('editor', { value: 1 });
    store.clear('editor', requestId);
    const data = await store.waitFor('editor', requestId, 1);
    assert.equal(data, null);
  }

  console.log('Popout payload store tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

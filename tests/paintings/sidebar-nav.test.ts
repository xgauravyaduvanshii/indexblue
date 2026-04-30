import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('app sidebar includes a Paintings link', async () => {
  const source = await fs.readFile(
    new URL('../../components/app-sidebar.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /href=['"]\/paintings['"]/);
  assert.match(source, />Paintings</);
});

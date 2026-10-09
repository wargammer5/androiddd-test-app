import { it, expect } from 'vitest';
import { validateAll } from '../src/index.ts';

it('content is consistent', () => {
  expect(validateAll()).toEqual([]);
});

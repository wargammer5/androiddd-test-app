import { validateAll } from '@sotv/content';

const errors = validateAll();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('content OK');

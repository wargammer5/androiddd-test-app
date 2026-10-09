import { render } from 'preact';
import { App } from './ui/App.tsx';

window.addEventListener('error', (e) => {
  console.error('uncaught', e.message);
});
render(<App />, document.getElementById('app')!);

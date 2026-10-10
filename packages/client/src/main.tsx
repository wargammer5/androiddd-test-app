import { render } from 'preact';
import { App } from './ui/App.tsx';
import { installCrashHandlers } from './crashlog.ts';

installCrashHandlers();
render(<App />, document.getElementById('app')!);

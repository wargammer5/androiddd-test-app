import { Component, type ComponentChildren } from 'preact';
import { logCrash } from '../crashlog.ts';
import { t } from '../i18n.ts';

export class ErrorBoundary extends Component<{ children: ComponentChildren; onReset: () => void }, { error: string | null }> {
  override state = { error: null as string | null };

  override componentDidCatch(err: unknown): void {
    const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
    logCrash('ui', msg);
    this.setState({ error: msg });
  }

  override render() {
    if (this.state.error)
      return (
        <div class="screen" data-testid="crash-screen">
          <div class="panel">
            <h2>{t('crash.title')}</h2>
            <p>{t('crash.text')}</p>
            <pre class="small muted" style={{ whiteSpace: 'pre-wrap', maxHeight: '30vh', overflow: 'auto' }}>
              {this.state.error.split('\n').slice(0, 6).join('\n')}
            </pre>
            <button
              class="primary"
              onClick={() => {
                this.setState({ error: null });
                this.props.onReset();
              }}
            >
              {t('menu.exitToMenu')}
            </button>
          </div>
        </div>
      );
    return this.props.children;
  }
}

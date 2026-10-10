import { useState } from 'preact/hooks';
import { POWERS, type PowerDef } from '@sotv/sim';
import type { GameSession } from '../game.ts';
import { useStore } from '../store.ts';
import { t } from '../i18n.ts';

const TABS: { id: PowerDef['tab']; icon: string }[] = [
  { id: 'world', icon: '🌍' },
  { id: 'civ', icon: '🏰' },
  { id: 'creatures', icon: '🐾' },
  { id: 'nature', icon: '🌋' },
  { id: 'destruction', icon: '💥' },
  { id: 'other', icon: '✨' },
];

export function Toolbar({ session, onConfirm }: { session: GameSession; onConfirm: (p: PowerDef, go: () => void) => void }) {
  const tool = useStore(session.tool);
  const [tab, setTab] = useState<PowerDef['tab']>('world');
  const powers = [...POWERS.values()].filter((p) => p.tab === tab && p.icon);
  const tabs = TABS.filter((tb) => [...POWERS.values()].some((p) => p.tab === tb.id));
  const current = tool.power ? POWERS.get(tool.power) : undefined;
  const select = (p: PowerDef) => {
    if (tool.power === p.id) {
      session.tool.set({ ...tool, power: null });
      return;
    }
    const go = () => session.tool.set({ ...tool, power: p.id, arg: p.args ? (tool.power === p.id ? tool.arg : p.args[0]) : undefined, size: Math.max(tool.size, p.minRadius ?? 0) });
    if (p.danger) onConfirm(p, go);
    else go();
  };
  return (
    <div class="toolbar" data-testid="toolbar">
      {current?.args && (
        <div class="tool-args">
          {current.args.map((a) => (
            <button key={a} class={tool.arg === a ? 'on' : ''} onClick={() => session.tool.set({ ...tool, arg: a })}>
              {t(argKey(current.id, a))}
            </button>
          ))}
        </div>
      )}
      <div class="tool-row">
        <button class={tool.power === null ? 'on' : ''} onClick={() => session.tool.set({ ...tool, power: null })} title={t('tool.hand')} data-testid="tool-hand">
          ✋
        </button>
        <div class="tool-powers">
          {powers.map((p) => (
            <button key={p.id} class={'power' + (tool.power === p.id ? ' on' : '') + (p.danger ? ' danger' : '')} onClick={() => select(p)} title={t('power.' + p.id)} data-testid={'power-' + p.id}>
              <span class="pi">{p.icon}</span>
              <span class="pl">{t('power.' + p.id)}</span>
            </button>
          ))}
        </div>
      </div>
      <div class="tool-row">
        <div class="tabs">
          {tabs.map((tb) => (
            <button key={tb.id} class={tab === tb.id ? 'on' : ''} onClick={() => setTab(tb.id)} title={t('tab.' + tb.id)} data-testid={'tab-' + tb.id}>
              {tb.icon}
            </button>
          ))}
        </div>
        {current?.brush && (
          <div class="brush">
            <button onClick={() => session.tool.set({ ...tool, shape: tool.shape === 'circle' ? 'square' : 'circle' })} title={t('tool.shape')}>
              {tool.shape === 'circle' ? '●' : '■'}
            </button>
            <input type="range" min={0.5} max={30} step={0.5} value={tool.size} onInput={(e) => session.tool.set({ ...tool, size: Number((e.target as HTMLInputElement).value) })} aria-label={t('tool.size')} />
            <span class="small">{tool.size}</span>
          </div>
        )}
        <button onClick={() => session.cmd({ t: 'undo' })} title={t('tool.undo')} data-testid="btn-undo">
          ↶
        </button>
      </div>
    </div>
  );
}

export function argKey(power: string, a: string): string {
  if (power === 'biome') return 'biome.' + a;
  if (power === 'world_age') return 'age.' + a;
  return `arg.${power}.${a}`;
}

import { useEffect, useState } from 'preact/hooks';
import type { GameSession } from '../game.ts';
import { useStore } from '../store.ts';
import { t } from '../i18n.ts';
import { biomes } from '@sotv/content';
import { UnitCard } from './UnitCard.tsx';
import { CityPanel } from './CityPanel.tsx';

interface CellInfo {
  x: number;
  y: number;
  biome: number;
  height: number;
  moist: number;
  temp: number;
  mat: number;
  depth: number;
  obj: number;
  fire: number;
  zone: number;
  objName?: string;
  city?: { id: number; name: string };
  kingdom?: { id: number; name: string };
}

const MATS = ['', 'mat.water', 'mat.lava', 'mat.acid', 'mat.snow', 'mat.ice'];

export function Inspector({ session }: { session: GameSession }) {
  const ins = useStore(session.inspect);
  const [cell, setCell] = useState<CellInfo | null>(null);
  const [unit, setUnit] = useState<number | null>(null);
  const [city, setCity] = useState<number | null>(null);
  useEffect(() => {
    if (!ins) {
      setCell(null);
      setUnit(null);
      setCity(null);
      return;
    }
    setCity(null);
    let alive = true;
    session.query<{ id: number } | null>({ kind: 'unitAt', x: ins.x + 0.5, y: ins.y + 0.5, r: Math.max(1.2, 10 / session.cam.zoom) }).then((u) => {
      if (!alive) return;
      if (u) {
        setUnit(u.id);
        setCell(null);
      } else {
        setUnit(null);
        session.query<CellInfo>({ kind: 'cell', x: ins.x, y: ins.y }).then((c) => alive && setCell(c));
      }
    });
    return () => {
      alive = false;
    };
  }, [ins?.at]);
  if (!ins) return null;
  const close = () => session.inspect.set(null);
  if (unit !== null) return <UnitCard session={session} id={unit} onClose={close} />;
  if (city !== null) return <CityPanel session={session} id={city} onClose={close} />;
  if (!cell) return null;
  const b = biomes[cell.biome];
  return (
    <div class="side-panel" data-testid="inspector">
      <div class="panel-head">
        <b>{b ? t('biome.' + b.key) : '?'}</b>
        <span class="muted small">
          {cell.x}, {cell.y}
        </span>
        <span class="grow" />
        <button onClick={close}>✕</button>
      </div>
      <div class="kv">
        <span>{t('cell.height')}</span>
        <b>{cell.height}</b>
        <span>{t('cell.temp')}</span>
        <b>{cell.temp}°</b>
        <span>{t('cell.moist')}</span>
        <b>{Math.round((cell.moist / 255) * 100)}%</b>
        {cell.mat > 0 && cell.depth > 0 && (
          <>
            <span>{t(MATS[cell.mat] ?? '')}</span>
            <b>{cell.depth}</b>
          </>
        )}
        {cell.objName && (
          <>
            <span>{t('cell.object')}</span>
            <b>{t(cell.objName)}</b>
          </>
        )}
        {cell.fire > 0 && (
          <>
            <span>{t('cell.fire')}</span>
            <b>🔥 {cell.fire}</b>
          </>
        )}
        {cell.city && (
          <>
            <span>{t('cell.city')}</span>
            <b>
              <a class="link" onClick={() => setCity(cell.city!.id)} data-testid="open-city">
                {cell.city.name} ›
              </a>
            </b>
          </>
        )}
        {cell.kingdom && (
          <>
            <span>{t('cell.kingdom')}</span>
            <b>{cell.kingdom.name}</b>
          </>
        )}
      </div>
    </div>
  );
}

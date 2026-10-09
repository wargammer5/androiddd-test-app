import type { GameSession } from '../game.ts';

export function UnitCard({ id, onClose }: { session: GameSession; id: number; onClose: () => void }) {
  return (
    <div class="side-panel">
      <div class="panel-head">
        <b>#{id}</b>
        <span class="grow" />
        <button onClick={onClose}>✕</button>
      </div>
    </div>
  );
}

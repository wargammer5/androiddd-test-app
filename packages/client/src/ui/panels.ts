import type { FunctionComponent } from 'preact';
import type { GameSession } from '../game.ts';

export type PanelProps = { session: GameSession; onClose: () => void };
export const extraPanels: Record<string, FunctionComponent<PanelProps>> = {};

export function registerPanel(id: string, c: FunctionComponent<PanelProps>): void {
  extraPanels[id] = c;
}

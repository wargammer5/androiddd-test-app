import type { FunctionComponent } from 'preact';
import type { GameSession } from '../game.ts';

export type PanelProps = { session: GameSession; onClose: () => void };
export const extraPanels: Record<string, FunctionComponent<PanelProps>> = {};

import { t } from '../i18n.ts';

export function Confirm({ text, onYes, onNo }: { text: string; onYes: () => void; onNo: () => void }) {
  return (
    <div class="modal-back" onClick={onNo}>
      <div class="panel" onClick={(e) => e.stopPropagation()} data-testid="confirm">
        <p>{text}</p>
        <div class="row">
          <button class="danger" onClick={onYes} data-testid="confirm-yes" data-sfx="ui_confirm">
            {t('common.yes')}
          </button>
          <button onClick={onNo} data-sfx="ui_back">{t('common.no')}</button>
        </div>
      </div>
    </div>
  );
}

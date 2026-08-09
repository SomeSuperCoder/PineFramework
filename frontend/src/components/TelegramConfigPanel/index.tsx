import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AlertConditionData } from '../../types';
import { AccessControlCard } from './AccessControlCard';
import { CardSkeleton } from './CardSkeleton';
import { ConnectionCard } from './ConnectionCard';
import { DiagnosticsCard } from './DiagnosticsCard';
import { RecipientsCard } from './RecipientsCard';
import { StatusCallout } from './StatusCallout';
import { useTelegramSettings } from './useTelegramSettings';

interface TelegramConfigPanelProps {
  alertConditions: AlertConditionData[];
  onClose?: () => void;
}

/** Telegram settings shell: header + four settings cards. */
export function TelegramConfigPanel({ alertConditions, onClose }: TelegramConfigPanelProps) {
  const tg = useTelegramSettings(alertConditions);

  return (
    <div className="flex flex-1 flex-col overflow-auto rounded-md border border-border bg-card p-5 text-foreground">
      <header className="mb-4 flex items-center justify-between gap-2.5">
        <h3 className="m-0 text-[16px] font-semibold tracking-tight">Telegram Configuration</h3>
        {onClose ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Back to dashboard"
          >
            <X className="size-4" />
          </Button>
        ) : null}
      </header>

      {tg.loading ? (
        <div className="flex flex-col gap-4">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : tg.error ? (
        <div className="flex flex-1 flex-col items-start gap-3">
          <StatusCallout tone="error">{tg.error}</StatusCallout>
          <Button
            type="button"
            variant="outline"
            onClick={() => void tg.actions.loadConfig()}
            className="h-10"
          >
            Retry
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <ConnectionCard
            botToken={tg.botToken}
            onBotTokenChange={tg.setBotToken}
            botTokenDirty={tg.botTokenDirty}
            tokenSaving={!!tg.busy.saveToken}
            tokenStatus={tg.status.saveToken}
            onSaveToken={() => void tg.actions.saveBotToken()}
            proxy={tg.proxy}
            onProxyFieldChange={tg.setProxyField}
            proxyDirty={tg.proxyDirty}
            proxySaving={!!tg.busy.proxy}
            proxyStatus={tg.status.proxy}
            showProxyPassword={tg.showProxyPassword}
            onToggleProxyPassword={tg.toggleShowProxyPassword}
            onSaveProxy={() => void tg.actions.saveProxy()}
          />
          <DiagnosticsCard
            botToken={tg.botToken}
            testing={!!tg.busy.test}
            testStatus={tg.status.test}
            onSendTest={() => void tg.actions.sendTest()}
          />
          <AccessControlCard
            currentAdmin={tg.data?.admin ?? null}
            requests={tg.data?.requests ?? []}
            controllers={tg.data?.controllers ?? []}
            admin={tg.admin}
            onAdminFieldChange={tg.setAdminField}
            busy={tg.busy}
            onSetAdmin={() => void tg.actions.setAdmin()}
            onApproveRequest={(userId) => void tg.actions.approveRequest(userId)}
            onDenyRequest={(userId) => void tg.actions.denyRequest(userId)}
            onRemoveController={(userId) => void tg.actions.removeController(userId)}
          />
          <RecipientsCard
            chats={tg.data?.chats ?? []}
            alertConditions={alertConditions}
            busy={tg.busy}
            getAlertPref={tg.getAlertPref}
            onUpdateChatLanguage={(chatId, language) =>
              void tg.actions.updateChatLanguage(chatId, language)
            }
            onUnlinkChat={(chatId) => void tg.actions.unlinkChat(chatId)}
            onToggleAlert={tg.actions.toggleAlert}
          />
        </div>
      )}
    </div>
  );
}

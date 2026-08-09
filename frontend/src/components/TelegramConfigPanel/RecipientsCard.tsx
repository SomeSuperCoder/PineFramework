import {
  AlertTriangle,
  ChevronDown,
  Languages,
  Link2Off,
  Loader2,
  MessageSquare,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import type { AlertConditionData, ChatLanguage, TelegramChat } from '../../types';
import { SectionHeader } from './SectionHeader';

interface RecipientsCardProps {
  chats: TelegramChat[];
  alertConditions: AlertConditionData[];
  busy: Record<string, boolean>;
  getAlertPref: (chatId: number, alertId: string) => boolean;
  onUpdateChatLanguage: (chatId: number, language: ChatLanguage) => void;
  onUnlinkChat: (chatId: number) => void;
  onToggleAlert: (chatId: number, alertId: string, currentEnabled: boolean) => void;
}

const CHAT_TYPE_LABELS: Record<TelegramChat['type'], string> = {
  private: 'Private',
  group: 'Group',
};

const LANGUAGE_OPTIONS: Array<{ value: ChatLanguage; label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'ru', label: 'Russian' },
];

function chatTitle(chat: TelegramChat): string {
  return chat.title ?? `Chat ${chat.chatId}`;
}

/** Linked chats with per-chat language + members, and per-alert delivery toggles. */
export function RecipientsCard({
  chats,
  alertConditions,
  busy,
  getAlertPref,
  onUpdateChatLanguage,
  onUnlinkChat,
  onToggleAlert,
}: RecipientsCardProps) {
  const linkedChats = chats.filter((chat) => chat.linked);

  return (
    <Card className="rounded-md border border-border bg-card">
      <CardHeader className="p-5 pb-2">
        <CardTitle className="text-base font-semibold">Recipients</CardTitle>
        <CardDescription className="text-[13px] text-muted-foreground">
          Choose which chats receive alerts and how each alert is delivered.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 p-5 pt-2">
        <section aria-label="Chats">
          <SectionHeader icon={MessageSquare} title="Chats" />
          {linkedChats.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">No chats linked yet.</p>
          ) : (
            <ScrollArea className="max-h-[320px]">
              <div className="divide-y divide-border/50 pr-1">
                {linkedChats.map((chat) => (
                  <ChatCollapsible
                    key={chat.chatId}
                    chat={chat}
                    busy={busy}
                    onUpdateChatLanguage={onUpdateChatLanguage}
                    onUnlinkChat={onUnlinkChat}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </section>

        <Separator />

        <section aria-label="Per-alert toggles">
          <SectionHeader icon={AlertTriangle} title="Per-Alert Toggles" />
          {alertConditions.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              No alerts configured yet.
            </p>
          ) : (
            <div className="divide-y divide-border/50">
              {alertConditions.map((alert) => (
                <AlertCollapsible
                  key={alert.id}
                  alert={alert}
                  chats={linkedChats}
                  getAlertPref={getAlertPref}
                  onToggleAlert={onToggleAlert}
                />
              ))}
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

interface ChatCollapsibleProps {
  chat: TelegramChat;
  busy: Record<string, boolean>;
  onUpdateChatLanguage: (chatId: number, language: ChatLanguage) => void;
  onUnlinkChat: (chatId: number) => void;
}

function ChatCollapsible({ chat, busy, onUpdateChatLanguage, onUnlinkChat }: ChatCollapsibleProps) {
  const langBusy = !!busy[`lang:${chat.chatId}`];
  const unlinkBusy = !!busy[`unlink:${chat.chatId}`];
  const members = Object.entries(chat.memberSubscriptions);
  const title = chatTitle(chat);

  return (
    <Collapsible>
      <div className="flex items-center justify-between gap-3 py-2">
        <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&[data-state=open]>svg]:rotate-180">
          <Badge variant="outline">{CHAT_TYPE_LABELS[chat.type]}</Badge>
          <span className="min-w-0 truncate text-sm font-medium text-foreground">{title}</span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform" />
        </CollapsibleTrigger>
        <div className="flex shrink-0 items-center gap-2">
          <Select
            value={chat.language}
            onValueChange={(value) => onUpdateChatLanguage(chat.chatId, value as ChatLanguage)}
            disabled={langBusy}
          >
            <SelectTrigger className="h-10" aria-label={`Language for ${title}`}>
              <Languages className="size-4 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-10"
                disabled={unlinkBusy}
                aria-busy={unlinkBusy}
                aria-label={`Unlink ${title}`}
              >
                {unlinkBusy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Link2Off className="size-4" />
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Unlink chat?</AlertDialogTitle>
                <AlertDialogDescription>
                  This stops alerts and removes {title} from the recipients list.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() => onUnlinkChat(chat.chatId)}>
                  Unlink
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
      <CollapsibleContent>
        {members.length === 0 ? (
          <p className="py-2 pl-2 text-xs text-muted-foreground">No members in this chat.</p>
        ) : (
          <ScrollArea className="max-h-[160px]">
            <div className="space-y-1 py-1 pl-2 pr-1">
              {members.map(([memberId, types]) => (
                <div key={memberId} className="flex items-center justify-between gap-3 py-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm text-foreground">User {memberId}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {types.length} subscription{types.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <Switch
                    checked={types.length > 0}
                    disabled
                    aria-label={`Subscriptions for user ${memberId}`}
                  />
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

interface AlertCollapsibleProps {
  alert: AlertConditionData;
  chats: TelegramChat[];
  getAlertPref: (chatId: number, alertId: string) => boolean;
  onToggleAlert: (chatId: number, alertId: string, currentEnabled: boolean) => void;
}

function AlertCollapsible({ alert, chats, getAlertPref, onToggleAlert }: AlertCollapsibleProps) {
  const enabledCount = chats.filter((chat) => getAlertPref(chat.chatId, alert.id)).length;

  return (
    <Collapsible>
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 rounded-md py-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&[data-state=open]>svg]:rotate-180">
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-sm font-medium text-foreground">{alert.title}</span>
          <Badge variant="secondary">
            {enabledCount}/{chats.length}
          </Badge>
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        {chats.length === 0 ? (
          <p className="py-2 pl-2 text-xs text-muted-foreground">Link a chat to enable alerts.</p>
        ) : (
          <ScrollArea className="max-h-[240px]">
            <div className="space-y-1 py-1 pl-2 pr-1">
              {chats.map((chat) => {
                const enabled = getAlertPref(chat.chatId, alert.id);
                const title = chatTitle(chat);
                return (
                  <div key={chat.chatId} className="flex items-center justify-between gap-3 py-1">
                    <span className="min-w-0 truncate text-sm text-foreground">{title}</span>
                    <Switch
                      checked={enabled}
                      onCheckedChange={() => onToggleAlert(chat.chatId, alert.id, enabled)}
                      aria-label={`${alert.title} for ${title}`}
                    />
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

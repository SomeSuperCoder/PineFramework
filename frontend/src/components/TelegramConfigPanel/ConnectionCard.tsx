import { useState } from 'react';
import { Eye, EyeOff, KeyRound, Loader2, Plug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { SectionHeader } from './SectionHeader';
import { StatusCallout } from './StatusCallout';
import type { ProxyDraft, ProxyField, SaveStatus } from './useTelegramSettings';

interface ConnectionCardProps {
  botToken: string;
  onBotTokenChange: (value: string) => void;
  botTokenDirty: boolean;
  tokenSaving: boolean;
  tokenStatus: SaveStatus;
  onSaveToken: () => void;
  proxy: ProxyDraft;
  onProxyFieldChange: (field: ProxyField, value: string) => void;
  proxyDirty: boolean;
  proxySaving: boolean;
  proxyStatus: SaveStatus;
  showProxyPassword: boolean;
  onToggleProxyPassword: () => void;
  onSaveProxy: () => void;
}

/** Bot token + HTTP proxy connection settings. */
export function ConnectionCard({
  botToken,
  onBotTokenChange,
  botTokenDirty,
  tokenSaving,
  tokenStatus,
  onSaveToken,
  proxy,
  onProxyFieldChange,
  proxyDirty,
  proxySaving,
  proxyStatus,
  showProxyPassword,
  onToggleProxyPassword,
  onSaveProxy,
}: ConnectionCardProps) {
  const [showBotToken, setShowBotToken] = useState(false);

  return (
    <Card className="rounded-md border border-border bg-card">
      <CardHeader className="p-5 pb-2">
        <CardTitle className="text-base font-semibold">Connection</CardTitle>
        <CardDescription className="text-[13px] text-muted-foreground">
          Bot token and optional HTTP proxy for the Telegram integration.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 p-5 pt-2">
        <section aria-label="Bot token">
          <SectionHeader icon={KeyRound} title="Bot Token" />
          <Label htmlFor="tg-bot-token" className="mb-1.5 block text-[13px] font-medium">
            Bot Token
          </Label>
          <InputGroup className="h-10">
            <InputGroupInput
              id="tg-bot-token"
              type={showBotToken ? 'text' : 'password'}
              value={botToken}
              onChange={(e) => onBotTokenChange(e.target.value)}
              placeholder="Enter your bot token"
              autoComplete="off"
              className="h-10"
            />
            <InputGroupButton
              type="button"
              onClick={() => setShowBotToken((prev) => !prev)}
              aria-label={showBotToken ? 'Hide bot token' : 'Show bot token'}
              aria-pressed={showBotToken}
              className="h-10 w-10"
            >
              {showBotToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </InputGroupButton>
          </InputGroup>
          <div className="mt-3 flex justify-end">
            <Button
              type="button"
              onClick={onSaveToken}
              disabled={tokenSaving || !botTokenDirty}
              aria-busy={tokenSaving}
              className="h-10"
            >
              {tokenSaving ? <Loader2 className="size-4 animate-spin" /> : null}
              Save
            </Button>
          </div>
          {tokenStatus === 'saved' ? (
            <StatusCallout tone="success" className="mt-3">
              Token saved
            </StatusCallout>
          ) : null}
          {tokenStatus === 'error' ? (
            <StatusCallout tone="error" className="mt-3">
              Failed to save
            </StatusCallout>
          ) : null}
        </section>

        <Separator />

        <section aria-label="HTTP proxy">
          <SectionHeader icon={Plug} title="HTTP Proxy" />
          <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="tg-proxy-host" className="text-[13px] font-medium">
                Host
              </Label>
              <Input
                id="tg-proxy-host"
                type="text"
                value={proxy.host}
                onChange={(e) => onProxyFieldChange('host', e.target.value)}
                placeholder="Host (e.g., 127.0.0.1)"
                className="h-10"
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="tg-proxy-port" className="text-[13px] font-medium">
                Port
              </Label>
              <Input
                id="tg-proxy-port"
                type="number"
                value={proxy.port}
                onChange={(e) => onProxyFieldChange('port', e.target.value)}
                placeholder="Port"
                min={1}
                max={65535}
                className="h-10"
              />
            </div>
          </div>
          <div className="mt-2 flex flex-col gap-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="tg-proxy-user" className="text-[13px] font-medium">
                Username
              </Label>
              <Input
                id="tg-proxy-user"
                type="text"
                value={proxy.username}
                onChange={(e) => onProxyFieldChange('username', e.target.value)}
                placeholder="Username (optional)"
                autoComplete="off"
                className="h-10"
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="tg-proxy-pass" className="text-[13px] font-medium">
                Password
              </Label>
              <InputGroup className="h-10">
                <InputGroupInput
                  id="tg-proxy-pass"
                  type={showProxyPassword ? 'text' : 'password'}
                  value={proxy.password}
                  onChange={(e) => onProxyFieldChange('password', e.target.value)}
                  placeholder="Password (optional)"
                  autoComplete="off"
                  className="h-10"
                />
                <InputGroupButton
                  type="button"
                  onClick={onToggleProxyPassword}
                  aria-label={showProxyPassword ? 'Hide proxy password' : 'Show proxy password'}
                  aria-pressed={showProxyPassword}
                  className="h-10 w-10"
                >
                  {showProxyPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </InputGroupButton>
              </InputGroup>
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={onSaveProxy}
              disabled={proxySaving || !proxyDirty}
              aria-busy={proxySaving}
              className="h-10"
            >
              {proxySaving ? <Loader2 className="size-4 animate-spin" /> : null}
              Save Proxy
            </Button>
          </div>
          {proxyStatus === 'saved' ? (
            <StatusCallout tone="success" className="mt-3">
              Proxy saved
            </StatusCallout>
          ) : null}
          {proxyStatus === 'error' ? (
            <StatusCallout tone="error" className="mt-3">
              Failed to save
            </StatusCallout>
          ) : null}
        </section>
      </CardContent>
    </Card>
  );
}

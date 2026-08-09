import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SettingRow } from './SettingRow';
import { StatusCallout } from './StatusCallout';
import type { TestStatus } from './useTelegramSettings';

interface DiagnosticsCardProps {
  botToken: string;
  testing: boolean;
  testStatus: TestStatus;
  onSendTest: () => void;
}

/** Connectivity check: sends a test message through the configured bot. */
export function DiagnosticsCard({
  botToken,
  testing,
  testStatus,
  onSendTest,
}: DiagnosticsCardProps) {
  return (
    <Card className="rounded-md border border-border bg-card">
      <CardHeader className="p-5 pb-2">
        <CardTitle className="text-base font-semibold">Diagnostics</CardTitle>
        <CardDescription className="text-[13px] text-muted-foreground">
          Send a test message to confirm the bot can reach Telegram.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-5 pt-2">
        <SettingRow
          label="Test Message"
          description="Delivers a message to your linked chat to verify connectivity."
        >
          <Button
            type="button"
            onClick={onSendTest}
            disabled={testing || !botToken}
            aria-busy={testing}
            className="h-10"
          >
            {testing ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Send Test Message
          </Button>
        </SettingRow>
        {testStatus === 'ok' ? (
          <StatusCallout tone="success" className="mt-3">
            Connected — test message sent.
          </StatusCallout>
        ) : null}
        {testStatus === 'error' ? (
          <StatusCallout tone="error" className="mt-3">
            Failed — click Send Test Message to retry.
          </StatusCallout>
        ) : null}
      </CardContent>
    </Card>
  );
}

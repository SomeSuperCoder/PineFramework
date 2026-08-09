import { useState } from 'react';
import { Check, Loader2, Shield, Trash2, Users, X } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import type { TelegramAdmin, TelegramControlRequest, TelegramController } from '../../types';
import { SectionHeader } from './SectionHeader';
import { SettingRow } from './SettingRow';
import { StatusCallout } from './StatusCallout';
import type { AdminDraft } from './useTelegramSettings';

interface AccessControlCardProps {
  currentAdmin: TelegramAdmin | null;
  requests: TelegramControlRequest[];
  controllers: TelegramController[];
  admin: AdminDraft;
  onAdminFieldChange: (field: keyof AdminDraft, value: string) => void;
  busy: Record<string, boolean>;
  onSetAdmin: () => void;
  onApproveRequest: (userId: number) => void;
  onDenyRequest: (userId: number) => void;
  onRemoveController: (userId: number) => void;
}

const ADMIN_SAVED_RESET_MS = 2000;

/** Admin + controller requests + active controllers. */
export function AccessControlCard({
  currentAdmin,
  requests,
  controllers,
  admin,
  onAdminFieldChange,
  busy,
  onSetAdmin,
  onApproveRequest,
  onDenyRequest,
  onRemoveController,
}: AccessControlCardProps) {
  const [adminSaved, setAdminSaved] = useState(false);

  const adminUserId = Number.parseInt(admin.userId, 10);
  const adminDirty =
    !Number.isNaN(adminUserId) &&
    adminUserId > 0 &&
    (admin.userId !== (currentAdmin ? String(currentAdmin.userId) : '') ||
      admin.username !== (currentAdmin?.username ?? ''));

  const handleAdminFieldChange = (field: keyof AdminDraft, value: string) => {
    onAdminFieldChange(field, value);
    setAdminSaved(false);
  };

  const handleSetAdmin = () => {
    onSetAdmin();
    setAdminSaved(true);
  };

  return (
    <Card className="rounded-md border border-border bg-card">
      <CardHeader className="p-5 pb-2">
        <CardTitle className="text-base font-semibold">Access Control</CardTitle>
        <CardDescription className="text-[13px] text-muted-foreground">
          Control who can operate the bot: the admin, pending requests, and active controllers.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 p-5 pt-2">
        <section aria-label="Admin">
          <SectionHeader icon={Shield} title="Admin" />
          <SettingRow
            label="Current admin"
            description={
              currentAdmin ? currentAdmin.username || `User ${currentAdmin.userId}` : undefined
            }
          >
            {currentAdmin ? (
              <Badge variant="secondary">{currentAdmin.userId}</Badge>
            ) : (
              <span className="text-xs text-muted-foreground">Not configured</span>
            )}
          </SettingRow>
          <div className="mt-2 flex flex-col gap-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="tg-admin-uid" className="text-[13px] font-medium">
                User ID
              </Label>
              <Input
                id="tg-admin-uid"
                type="text"
                inputMode="numeric"
                value={admin.userId}
                onChange={(e) => handleAdminFieldChange('userId', e.target.value)}
                placeholder="Telegram user ID"
                autoComplete="off"
                className="h-10"
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="tg-admin-username" className="text-[13px] font-medium">
                Username
              </Label>
              <Input
                id="tg-admin-username"
                type="text"
                value={admin.username}
                onChange={(e) => handleAdminFieldChange('username', e.target.value)}
                placeholder="@username (optional)"
                autoComplete="off"
                className="h-10"
              />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <Button
              type="button"
              onClick={handleSetAdmin}
              disabled={!!busy.admin || !adminDirty}
              aria-busy={!!busy.admin}
              className="h-10"
            >
              {busy.admin ? <Loader2 className="size-4 animate-spin" /> : null}
              Set as Admin
            </Button>
          </div>
          {adminSaved ? (
            <StatusCallout tone="success" autoDismissMs={ADMIN_SAVED_RESET_MS} className="mt-3">
              Admin saved
            </StatusCallout>
          ) : null}
        </section>

        <Separator />

        <section aria-label="Controller requests">
          <SectionHeader icon={Users} title="Controller Requests" />
          {requests.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">No pending requests.</p>
          ) : (
            <div className="divide-y divide-border/50">
              {requests.map((request) => (
                <RequestRow
                  key={request.userId}
                  request={request}
                  busy={busy}
                  onApprove={onApproveRequest}
                  onDeny={onDenyRequest}
                />
              ))}
            </div>
          )}
        </section>

        <Separator />

        <section aria-label="Controllers">
          <SectionHeader icon={Users} title="Controllers" />
          {controllers.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              No controllers configured.
            </p>
          ) : (
            <div className="divide-y divide-border/50">
              {controllers.map((controller) => (
                <ControllerRow
                  key={controller.userId}
                  controller={controller}
                  busy={busy}
                  onRemove={onRemoveController}
                />
              ))}
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

interface RequestRowProps {
  request: TelegramControlRequest;
  busy: Record<string, boolean>;
  onApprove: (userId: number) => void;
  onDeny: (userId: number) => void;
}

function RequestRow({ request, busy, onApprove, onDeny }: RequestRowProps) {
  const approveBusy = !!busy[`approve:${request.userId}`];
  const denyBusy = !!busy[`deny:${request.userId}`];
  const rowBusy = approveBusy || denyBusy;
  const identity = request.username || `User ${request.userId}`;

  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <Badge variant="outline">{identity}</Badge>
        <span className="truncate text-xs text-muted-foreground">ID {request.userId}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          type="button"
          onClick={() => onApprove(request.userId)}
          disabled={rowBusy}
          aria-busy={approveBusy}
          className="h-10"
        >
          {approveBusy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Approve
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => onDeny(request.userId)}
          disabled={rowBusy}
          aria-busy={denyBusy}
          className="h-10"
        >
          {denyBusy ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
          Deny
        </Button>
      </div>
    </div>
  );
}

interface ControllerRowProps {
  controller: TelegramController;
  busy: Record<string, boolean>;
  onRemove: (userId: number) => void;
}

function ControllerRow({ controller, busy, onRemove }: ControllerRowProps) {
  const removeBusy = !!busy[`remove:${controller.userId}`];
  const identity = controller.username || `User ${controller.userId}`;

  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <Badge variant="outline">{identity}</Badge>
        <span className="truncate text-xs text-muted-foreground">ID {controller.userId}</span>
      </div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            variant="destructive"
            disabled={removeBusy}
            aria-busy={removeBusy}
            className="h-10"
          >
            {removeBusy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            Remove
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove controller?</AlertDialogTitle>
            <AlertDialogDescription>This revokes their access.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => onRemove(controller.userId)}>
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

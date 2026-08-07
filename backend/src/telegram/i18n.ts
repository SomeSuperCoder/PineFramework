/**
 * i18n module for the PineFramework Telegram bot.
 *
 * Three fully-parallel dictionaries (`en`, `es`, `ru`) expose an identical key
 * set, guaranteed by the parity test in backend/tests/i18n.test.ts. `en` is the
 * source of truth: `I18nKey` is derived from it and `t()` falls back to it when
 * a non-`en` dictionary is missing a key.
 *
 * Interpolation uses `{{name}}` placeholders, substituted via `t(lang, key, { name: value })`.
 * Emoji are embedded INSIDE each translated string (per-language taste) — callers
 * must never concatenate emoji onto a result.
 */

export type BotLanguage = 'en' | 'es' | 'ru';

const en = {
  // ── /start ────────────────────────────────────────────────────────────────
  startWelcome:
    '🚀 *Welcome to PineFramework Bot!*\n\n' +
    'I stream your Pine indicator signals to this chat, so you never miss a move.\n\n' +
    'Send /help to see every command, or just tell me you are ready to roll.',
  helpCommands:
    '🤖 *Available commands:*\n\n' +
    '📌 /start — Welcome & setup\n' +
    '📋 /help — This list\n' +
    '🪪 /request — Send your identity to the team\n' +
    '🔔 /subscribe — Get trading alerts\n' +
    '🔕 /unsubscribe — Stop the alerts\n' +
    '🌐 /lang — Read or change the language\n' +
    '📊 /report — Latest performance recap\n' +
    '🔗 /link — Link this group (groups only)\n' +
    '🔓 /unlink — Unlink this group\n' +
    '⚙️ /stats — Engine status\n' +
    '🛑 /stop — Stop the engine\n' +
    '🚨 /emergency — Emergency engine halt',
  // ── /request ───────────────────────────────────────────────────────────────
  requestIdentity:
    '🪪 Identity request\n' +
    'Reply with your username and role to verify you belong here. Keep it short.',
  requestSubmitted: '✅ Request submitted. You will hear back soon.',
  requestAlreadyPending: '⏳ You already have a pending request — hang tight.',
  requestAlreadyGranted: '✅ You were already granted access. Welcome aboard.',
  // ── /subscribe ─────────────────────────────────────────────────────────────
  subscribeSuccess: '🔔 You are subscribed. Alerts are now live in this chat.',
  subscribeFailure: '⚠️ Could not subscribe. Check your identity is confirmed first.',
  // ── /unsubscribe ───────────────────────────────────────────────────────────
  unsubscribeSuccess: '🔕 Unsubscribed. You can come back anytime with /subscribe.',
  unsubscribeFailure: '⚠️ Could not unsubscribe — were you even subscribed?',
  // ── notifications management menu ──────────────────────────────────────────
  notificationsMenuTitle: '🔔 Manage notifications:\n\nTap a type to toggle alerts for this chat.',
  // ── /lang ──────────────────────────────────────────────────────────────────
  langUsage: '🌐 Usage: /lang <en|es|ru>\nExample: /lang es',
  langConfirm: '🌐 Got it — changing language…',
  langInvalid: '❌ Invalid language. Choose one of: en, es, ru.',
  langCurrent: '🌐 Current language: {{lang}}',
  langChanged: '🌐 Language set to {{lang}} ✅',
  // ── /report ────────────────────────────────────────────────────────────────
  reportHeader: '📊 *Performance recap:*',
  reportEmpty: '📊 No trades to report yet. As soon as there is action, you will see it here.',
  reportRow: '• {{symbol}} {{side}} — PnL {{pnl}}',
  // ── /link ──────────────────────────────────────────────────────────────────
  linkGroupOnly: '🔗 This command only works in a group chat.',
  linkSuccess: '✅ Group linked to your channel. Alerts will land here.',
  linkFail:
    '❌ Could not link this group. Make sure the bot is an admin and has the right to post.',
  unlinkSuccess: '🔓 Group unlinked.',
  unlinkFail: '❌ Could not unlink this group.',
  // ── /stats ────────────────────────────────────────────────────────────────
  statsHeader: '⚙️ Engine state:',
  statsRunning: '🟢 Status: *running* — all systems go.',
  statsStopped: '⛔ Status: *stopped*. Start it to resume automation.',
  statsError: '🚨 Status: *error* — check the logs.',
  statsPairs: '⚡ Pairs watched: {{count}}',
  statsPositions: '　　Open positions: {{count}}',
  // ── /stop ──────────────────────────────────────────────────────────────────
  stopConfirmRequest: '🛑 Confirm engine stop? Reply "yes" to proceed.',
  stopConfirmSuccess: '🛑 Engine stopped. It is safe to close the terminal.',
  stopCancelled: '↩️ Stop cancelled — engine keeps running.',
  // ── /emergency ─────────────────────────────────────────────────────────────
  emergencyResult: '🚨 Emergency: engine halted and positions frozen. Take it from here.',
  // ── permissions / system ──────────────────────────────────────────────────
  permDeniedGeneric: '⛔ Sorry, you do not have access to that.',
  permDeniedControl: '🛡️ Only an authorized operator can run that command.',
  engineNotInitialized: '🔄 Engine is not initialized yet. Give it a moment and try again.',
  unknownCommand: '🤔 Unknown command. Send /help to see what I can do.',
  invalidArgs: '❌ Invalid arguments. Check the command usage.',
  validTypes:
    '📌 Valid types: trading, position_open, position_close, report, daily, error, bot_lifecycle.',
  // ── notifications ──────────────────────────────────────────────────────────
  positionOpened: '📈 Position opened: {{symbol}} {{side}} — qty {{qty}} @ {{price}}',
  positionClosed: '📉 Position closed: {{symbol}} — PnL {{pnl}}',
  botStarted: '🟢 PineFramework bot is back online.',
  botStopped: '🛑 PineFramework bot went offline.',
  emergency: '🚨 EMERGENCY — bot stepping away. Verify everything manually.',
  dailyLoss: '📉 Daily drawdown limit hit. Stop trading now to protect capital.',
  errorNotification: '⚠️ Something broke: {{message}}',
  warningNotification: '⚠️ Heads up: {{message}}',
  stateChange: '🔄 Engine state changed to: {{state}}',
  tradeNotification: '📊 Trade signal: {{symbol}} — {{pnl}}',
  reportSubmitted: '✅ Report submitted: {{report}}',
  connectionRestored: '🌐 Reconnected — alerts are flowing again.',
} as const;

const es: Record<keyof typeof en, string> = {
  // ── /start ────────────────────────────────────────────────────────────────
  startWelcome:
    '🚀 ¡Bienvenido a PineFramework Bot!\n\n' +
    'Te envío las señales de tus indicadores Pine a este chat, para que no te pierdas ni un movimiento.\n\n' +
    'Envía /help para ver todos los comandos, o simplemente prepárate para empezar.',
  helpCommands:
    '🤖 *Comandos disponibles:*\n\n' +
    '📌 /start — Bienvenida y configuración\n' +
    '📋 /help — Esta lista\n' +
    '🪪 /request — Envía tu identidad al equipo\n' +
    '🔔 /subscribe — Activar alertas de trading\n' +
    '🔕 /unsubscribe — Desactivar las alertas\n' +
    '🌐 /lang — Ver o cambiar el idioma\n' +
    '📊 /report — Resumen de rendimiento\n' +
    '🔗 /link — Vincular este grupo (solo grupos)\n' +
    '🔓 /unlink — Desvincular este grupo\n' +
    '⚙️ /stats — Estado del motor\n' +
    '🛑 /stop — Detener el motor\n' +
    '🚨 /emergency — Frenado de emergencia',
  // ── /request ───────────────────────────────────────────────────────────────
  requestIdentity:
    '🪪 Solicitud de identidad\n' + 'Responde con tu nombre de usuario para verificar. Sé breve.',
  requestSubmitted: '✅ Solicitud enviada. Pronto tendrás noticias.',
  requestAlreadyPending: '⏳ Ya tienes una solicitud en curso — paciencia.',
  requestAlreadyGranted: '✅ Ya tienes acceso. Bienvenido a bordo.',
  // ── /subscribe ─────────────────────────────────────────────────────────────
  subscribeSuccess: '🔔 Te has suscrito. Las alertas llegan a este chat.',
  subscribeFailure: '⚠️ No pude suscribirte. Verifica primero que tu identidad esté confirmada.',
  // ── /unsubscribe ───────────────────────────────────────────────────────────
  unsubscribeSuccess: '🔕 Te has desuscrito. Vuelve cuando quieras con /subscribe.',
  unsubscribeFailure: '⚠️ No pude desuscribirte — ¿estabas suscrito?',
  // ── menú de gestión de notificaciones ─────────────────────────────────────
  notificationsMenuTitle:
    '🔔 Gestionar notificaciones:\n\nToca un tipo para activar o desactivar las alertas en este chat.',
  // ── /lang ──────────────────────────────────────────────────────────────────
  langUsage: '🌐 Uso: /lang <idioma>\nEjemplo: /lang es',
  langConfirm: '🌐 Entendido — cambiando idioma…',
  langInvalid: '❌ Idioma no válido. Elige uno: en, es, ru.',
  langCurrent: '🌐 Idioma actual: {{lang}}',
  langChanged: '🌐 Idioma configurado: {{lang}} ✅',
  // ── /report ────────────────────────────────────────────────────────────────
  reportHeader: '📊 Resumen de rendimiento',
  reportEmpty: '📊 Aún no hay operaciones que reportar. Cuando haya señales, las verás aquí.',
  reportRow: '• {{symbol}} {{side}} — PnL {{pnl}}',
  // ── /link ──────────────────────────────────────────────────────────────────
  linkGroupOnly: '🔗 Este comando solo funciona en un grupo.',
  linkSuccess: '✅ Grupo vinculado a tu canal. Las alertas llegarán aquí.',
  linkFail:
    '❌ No se pudo vincular el grupo. Asegúrate de que el bot sea administrador y tenga permiso para publicar.',
  unlinkSuccess: '🔓 Grupo desvinculado.',
  unlinkFail: '❌ No se pudo desvincular este grupo.',
  // ── /stats ─────────────────────────────────────────────────────────────────
  statsHeader: '⚙️ Estado del motor:',
  statsRunning: '🟢 Estado: en marcha. Todo en orden.',
  statsStopped: '⛔ Estado: detenido. Arrácalo para reanudar la automatización.',
  statsError: '🚨 Estado: error. Revisa el registro de errores.',
  statsPairs: '⚡ Pares en seguimiento: {{count}}',
  statsPositions: '　　 Posiciones abiertas: {{count}}',
  // ── /stop ──────────────────────────────────────────────────────────────────
  stopConfirmRequest: '🛑 ¿Detener el motor? Responde "yes" para continuar.',
  stopConfirmSuccess: '🛑 Motor detenido. Ya puedes cerrar la terminal.',
  stopCancelled: '↩️ Detención cancelada. El motor sigue en marcha.',
  // ── /emergency ─────────────────────────────────────────────────────────────
  emergencyResult: '🚨 Emergencia: motor frenado. Toma el control desde aquí.',
  // ── permissions / system ──────────────────────────────────────────────────
  permDeniedGeneric: '⛔ Lo siento, no tienes acceso a eso.',
  permDeniedControl: '🛡️ Solo un operador autorizado puede ejecutar ese comando.',
  engineNotInitialized:
    '🔄 El motor aún no está inicializado. Espera un momento e inténtalo de nuevo.',
  unknownCommand: '🤔 Comando desconocido. Envía /help para ver qué puedo hacer.',
  invalidArgs: '❌ Argumentos no válidos. Revisa el uso del comando.',
  validTypes:
    '📌 Tipos válidos: trading, position_open, position_close, report, daily, error, bot_lifecycle.',
  // ── notifications ──────────────────────────────────────────────────────────
  positionOpened: '📈 Posición abierta: {{symbol}} {{side}} — cantidad {{qty}} @ {{price}}',
  positionClosed: '📉 Posición cerrada: {{symbol}} — PnL {{pnl}}',
  botStarted: '🟢 PineFramework Bot está de nuevo en línea.',
  botStopped: '🛑 PineFramework Bot se ha detenido.',
  emergency: '🚨 EMERGENCIA: el bot se retira. Verifícalo todo de inmediato.',
  dailyLoss: '📉 Límite de pérdida diaria alcanzado. Detén todo ya para proteger el capital.',
  errorNotification: '⚠️ Algo salió mal: {{message}}',
  warningNotification: '⚠️ Ojo: {{message}}',
  stateChange: '🔄 Cambio de estado del motor: {{state}}',
  tradeNotification: '📊 Señal de trading: {{symbol}} — {{pnl}}',
  reportSubmitted: '✅ Informe enviado: {{report}}',
  connectionRestored: '🌐 Conexión restablecida — las alertas vuelven a fluir.',
};

const ru: Record<keyof typeof en, string> = {
  // ── /start ────────────────────────────────────────────────────────────────
  startWelcome:
    '🚀 Добро пожаловать в PineFramework Bot!\n\n' +
    'Я присылаю сигналы ваших Pine-индикаторов прямо в этот чат, чтобы вы не упустили ни одного движения.\n\n' +
    'Отправьте /help, чтобы увидеть все команды, или просто будьте готовы к работе.',
  helpCommands:
    '🤖 *Команды:*\n\n' +
    '📌 /start — Приветствие и настройка\n' +
    '📋 /help — Этот список\n' +
    '🪪 /request — Отправить свою ID команде\n' +
    '🔔 /subscribe — Включить торговые оповещения\n' +
    '🔕 /unsubscribe — Отключить оповещения\n' +
    '🌐 /lang — Посмотреть или сменить язык\n' +
    '📊 /report — Итоги производительности\n' +
    '🔗 /link — Привязать группу (только для групп)\n' +
    '🔓 /unlink — Отвязать группу\n' +
    '⚙️ /stats — Состояние движка\n' +
    '🛑 /stop — Остановить движок\n' +
    '🚨 /emergency — Аварийная остановка',
  // ── /request ───────────────────────────────────────────────────────────────
  requestIdentity:
    '🪪 Запрос на идентификацию\n' + 'Укажите ваш username для проверки. Держитесь кратко.',
  requestSubmitted: '✅ Запрос отправлен. Скоро ответим.',
  requestAlreadyPending: '⏳ У вас уже есть активный запрос — ожидайте.',
  requestAlreadyGranted: '✅ Вам уже выдан доступ. С возвращением!',
  // ── /subscribe ─────────────────────────────────────────────────────────────
  subscribeSuccess: '🔔 Вы подписаны — оповещения летят в этот чат.',
  subscribeFailure: '⚠️ Не удалось подписаться. Сначала убедитесь, что ваша ID подтверждена.',
  // ── /unsubscribe ───────────────────────────────────────────────────────────
  unsubscribeSuccess: '🔕 Вы отписались. Вернётесь в любой момент через /subscribe.',
  unsubscribeFailure: '⚠️ Не удалось отписаться — а вы вообще подписывались?',
  // ── меню управления уведомлениями ─────────────────────────────────────────
  notificationsMenuTitle:
    '🔔 Управление уведомлениями:\n\nНажмите на тип, чтобы включить или отключить оповещения для этого чата.',
  // ── /lang ──────────────────────────────────────────────────────────────────
  langUsage: '🌐 Использование: /lang <язык>\nПример: /lang ru',
  langConfirm: '🌐 Понял — меняю язык…',
  langInvalid: '❌ Недопустимый язык. Выберите один из: en, es, ru.',
  langCurrent: '🌐 Текущий язык: {{lang}}',
  langChanged: '🌐 Язык переключён: {{lang}} ✅',
  // ── /report ────────────────────────────────────────────────────────────────
  reportHeader: '📊 Итоги производительности',
  reportEmpty: '📊 Пока нет сделок. Появятся сигналы — всё увидите здесь.',
  reportRow: '• {{symbol}} {{side}} — PnL {{pnl}}',
  // ── /link ──────────────────────────────────────────────────────────────────
  linkGroupOnly: '🔗 Эта команда работает только в группе.',
  linkSuccess: '✅ Группа привязана к вашему каналу. Оповещения придут сюда.',
  linkFail: '❌ Не удалось привязать группу. Убедитесь, что бот — админ и умеет писать в чат.',
  unlinkSuccess: '🔓 Группа отвязана.',
  unlinkFail: '❌ Не удалось отвязать эту группу.',
  // ── /stats ─────────────────────────────────────────────────────────────────
  statsHeader: '⚙️ Состояние движка:',
  statsRunning: '🟢 Статус: работает. Полный боевой режим.',
  statsStopped: '⛔ Статус: остановлен. Запустите, чтобы возобновить автоматизацию.',
  statsError: '🚨 Статус: ошибка. Проверьте лог движка.',
  statsPairs: '⚡ Пар под присмотром: {{count}}',
  statsPositions: '　　 Открытых позиций: {{count}}',
  // ── /stop ──────────────────────────────────────────────────────────────────
  stopConfirmRequest: '🛑 Остановить движок? Ответьте "yes", чтобы продолжить.',
  stopConfirmSuccess: '🛑 Движок остановлен. Терминал можно закрывать.',
  stopCancelled: '↩️ Остановка отменена. Движок продолжает работать.',
  // ── /emergency ─────────────────────────────────────────────────────────────
  emergencyResult: '🚨 Аварийно: движок остановлен, позиции — под контролем. Действуйте.',
  // ── permissions / system ──────────────────────────────────────────────────
  permDeniedGeneric: '⛔ К сожалению, у вас нет доступа к этому.',
  permDeniedControl: '🛡️ Эту команду может выполнять только авторизованный оператор.',
  engineNotInitialized: '🔄 Движок ещё не инициализирован. Подождите немного и попробуйте снова.',
  unknownCommand: '🤔 Неизвестная команда. Отправьте /help, чтобы узнать, что я умею.',
  invalidArgs: '❌ Недопустимые аргументы. Проверьте синтаксис команды.',
  validTypes:
    '📭 Допустимые типы: trading, position_open, position_close, report, daily, error, bot_lifecycle.',
  positionOpened: '📈 Позиция открыта: {{symbol}} {{side}} — объём {{qty}} @ {{price}}',
  positionClosed: '📉 Позиция закрыта: {{symbol}} — PnL {{pnl}}',
  botStarted: '🤖 PineFramework Bot снова в сети.',
  botStopped: '🛑 PineFramework Bot остановлен.',
  emergency: '🚨 ТРЕВОГА: бот останавливается. Немедленно всё проверьте.',
  dailyLoss: '📉 Дневной лимит потерь достигнут. Остановите всё, чтобы защитить капитал.',
  errorNotification: '⚠️ Что-то потекло: {{message}}',
  warningNotification: '⚠️ Внимание: {{message}}',
  stateChange: '🔄 Состояние движка изменилось: {{state}}',
  tradeNotification: '📊 Торговый сигнал: {{symbol}} — {{pnl}}',
  reportSubmitted: '✅ Отчёт отправлен: {{report}}',
  connectionRestored: '🌐 Связь восстановлена — оповещения снова идут.',
};

/** Every supported language code. */
const SUPPORTED_LANGUAGES: readonly BotLanguage[] = ['en', 'es', 'ru'];

export type I18nKey = keyof typeof en;

export const DICTIONARIES = { en, es, ru } as const;

/** Type guard narrowing an unknown value to a supported `BotLanguage`. */
export function isSupportedLanguage(v: unknown): v is BotLanguage {
  return typeof v === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(v);
}

/**
 * Resolve a translated string.
 * - Substitutes every `{{name}}` placeholder with a value from `params`.
 * - Falls back to the `en` dictionary when the key is missing in the target
 *   language, and finally to the raw key so it never returns blank.
 *
 * @param lang   target language
 * @param key    dictionary key (type-safe, derived from `en`)
 * @param params interpolation values, keyed by placeholder name
 */
export function t(
  lang: BotLanguage,
  key: I18nKey,
  params?: Record<string, string | number>,
): string {
  const dict = DICTIONARIES[lang];
  const resolved = dict[key] ?? en[key] ?? key;
  if (!params) return resolved;

  let out = resolved;
  for (const [name, value] of Object.entries(params)) {
    out = out.split(`{{${name}}}`).join(String(value));
  }
  return out;
}

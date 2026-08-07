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
  // ── /start dashboard ───────────────────────────────────────────────────────
  startWelcome:
    '🚀 *Welcome to PineFramework Bot!*\n\n' +
    'I stream your Pine indicator signals to this chat, so you never miss a move.\n\n' +
    'Use the buttons below to manage alerts, language, reports and more.\n' +
    'Operators also find the engine controls and group linking here.',
  // ── operator-access request ────────────────────────────────────────────────
  requestSubmitted: '✅ Request submitted. You will hear back soon.',
  requestAlreadyPending: '⏳ You already have a pending request — hang tight.',
  requestAlreadyGranted: '✅ You were already granted access. Welcome aboard.',
  // ── subscribe ─────────────────────────────────────────────────────────────
  subscribeSuccess: '🔔 You are subscribed. Alerts are now live in this chat.',
  subscribeFailure: '⚠️ Could not subscribe. Check your identity is confirmed first.',
  // ── unsubscribe ───────────────────────────────────────────────────────────
  unsubscribeSuccess: '🔕 Unsubscribed. Re-subscribe anytime from the dashboard buttons.',
  unsubscribeFailure: '⚠️ Could not unsubscribe — were you even subscribed?',
  // ── notifications management menu ──────────────────────────────────────────
  notificationsMenuTitle: '🔔 Manage notifications:\n\nTap a type to toggle alerts for this chat.',
  // ── language ───────────────────────────────────────────────────────────────
  langUsage: '🌐 Choose your preferred language:',
  langInvalid: '❌ Invalid language. Choose one of: en, es, ru.',
  langCurrent: '🌐 Current language: {{lang}}',
  langChanged: '🌐 Language set to {{lang}} ✅',
  // ── report ────────────────────────────────────────────────────────────────
  reportHeader: '📊 *Performance recap:*',
  reportEmpty: '📊 No trades to report yet. As soon as there is action, you will see it here.',
  reportRow: '• {{symbol}} {{side}} — PnL {{pnl}}',
  // ── link / unlink ─────────────────────────────────────────────────────────
  linkGroupOnly: '🔗 Linking only works in a group chat.',
  linkConfirmRequest: '🔗 Link this group to your channel? Alerts will land here.',
  linkSuccess: '✅ Group linked to your channel. Alerts will land here.',
  linkFail:
    '❌ Could not link this group. Make sure the bot is an admin and has the right to post.',
  linkCancelled: '↩️ Link cancelled — group unchanged.',
  unlinkConfirmRequest: '🔓 Unlink this group? Alerts will stop landing here.',
  unlinkSuccess: '🔓 Group unlinked.',
  unlinkFail: '❌ Could not unlink this group.',
  unlinkCancelled: '↩️ Unlink cancelled — group stays linked.',
  // ── stats ──────────────────────────────────────────────────────────────────
  statsHeader: '⚙️ Engine state:',
  statsRunning: '🟢 Status: *running* — all systems go.',
  statsStopped: '⛔ Status: *stopped*. Start it to resume automation.',
  statsError: '🚨 Status: *error* — check the logs.',
  statsPairs: '⚡ Pairs watched: {{count}}',
  statsPositions: '　　Open positions: {{count}}',
  // ── stop ──────────────────────────────────────────────────────────────────
  stopConfirmRequest: '🛑 Confirm engine stop? Tap ✅ Yes to confirm.',
  stopConfirmSuccess: '🛑 Engine stopped. It is safe to close the terminal.',
  stopCancelled: '↩️ Stop cancelled — engine keeps running.',
  // ── emergency ─────────────────────────────────────────────────────────────
  emergencyResult: '🚨 Emergency: engine halted and positions frozen. Take it from here.',
  // ── permissions / system ──────────────────────────────────────────────────
  permDeniedGeneric: '⛔ Sorry, you do not have access to that.',
  permDeniedControl: '🛡️ Only an authorized operator can do that.',
  engineNotInitialized: '🔄 Engine is not initialized yet. Give it a moment and try again.',
  unknownCommand:
    '🤔 I do not understand that. Use the buttons below or send /start for the main menu.',
  invalidArgs: '❌ Something went wrong. Try again from the main menu.',
  // ── notifications ──────────────────────────────────────────────────────────
  positionOpened: '📈 Position opened: {{symbol}} {{side}} — qty {{qty}} @ {{price}}',
  positionClosed: '📉 Position closed: {{symbol}} — PnL {{pnl}}',
  positionClosedNoPnl: '📉 Position closed: {{symbol}}',
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
  // ── panel de /start ────────────────────────────────────────────────────────
  startWelcome:
    '🚀 ¡Bienvenido a PineFramework Bot!\n\n' +
    'Te envío las señales de tus indicadores Pine a este chat, para que no te pierdas ni un movimiento.\n\n' +
    'Usa los botones de abajo para gestionar alertas, idioma, informes y más.\n' +
    'Los operadores también encuentran aquí los controles del motor y el enlace de grupos.',
  // ── solicitud de acceso de operador ────────────────────────────────────────
  requestSubmitted: '✅ Solicitud enviada. Pronto tendrás noticias.',
  requestAlreadyPending: '⏳ Ya tienes una solicitud en curso — paciencia.',
  requestAlreadyGranted: '✅ Ya tienes acceso. Bienvenido a bordo.',
  // ── subscribe ─────────────────────────────────────────────────────────────
  subscribeSuccess: '🔔 Te has suscrito. Las alertas llegan a este chat.',
  subscribeFailure: '⚠️ No pude suscribirte. Verifica primero que tu identidad esté confirmada.',
  // ── unsubscribe ───────────────────────────────────────────────────────────
  unsubscribeSuccess:
    '🔕 Te has desuscrito. Puedes volver a suscribirte desde los botones del menú.',
  unsubscribeFailure: '⚠️ No pude desuscribirte — ¿estabas suscrito?',
  // ── menú de gestión de notificaciones ─────────────────────────────────────
  notificationsMenuTitle:
    '🔔 Gestionar notificaciones:\n\nToca un tipo para activar o desactivar las alertas en este chat.',
  // ── idioma ────────────────────────────────────────────────────────────────
  langUsage: '🌐 Elige tu idioma preferido:',
  langInvalid: '❌ Idioma no válido. Elige uno: en, es, ru.',
  langCurrent: '🌐 Idioma actual: {{lang}}',
  langChanged: '🌐 Idioma configurado: {{lang}} ✅',
  // ── report ────────────────────────────────────────────────────────────────
  reportHeader: '📊 Resumen de rendimiento',
  reportEmpty: '📊 Aún no hay operaciones que reportar. Cuando haya señales, las verás aquí.',
  reportRow: '• {{symbol}} {{side}} — PnL {{pnl}}',
  // ── link / unlink ─────────────────────────────────────────────────────────
  linkGroupOnly: '🔗 Vincular solo funciona en un grupo.',
  linkConfirmRequest: '🔗 ¿Vincular este grupo a tu canal? Las alertas llegarán aquí.',
  linkSuccess: '✅ Grupo vinculado a tu canal. Las alertas llegarán aquí.',
  linkFail:
    '❌ No se pudo vincular el grupo. Asegúrate de que el bot sea administrador y tenga permiso para publicar.',
  linkCancelled: '↩️ Vinculación cancelada — el grupo no cambió.',
  unlinkConfirmRequest: '🔓 ¿Desvincular este grupo? Las alertas dejarán de llegar aquí.',
  unlinkSuccess: '🔓 Grupo desvinculado.',
  unlinkFail: '❌ No se pudo desvincular este grupo.',
  unlinkCancelled: '↩️ Desvinculación cancelada — el grupo sigue vinculado.',
  // ── stats ─────────────────────────────────────────────────────────────────
  statsHeader: '⚙️ Estado del motor:',
  statsRunning: '🟢 Estado: en marcha. Todo en orden.',
  statsStopped: '⛔ Estado: detenido. Arrácalo para reanudar la automatización.',
  statsError: '🚨 Estado: error. Revisa el registro de errores.',
  statsPairs: '⚡ Pares en seguimiento: {{count}}',
  statsPositions: '　　 Posiciones abiertas: {{count}}',
  // ── stop ──────────────────────────────────────────────────────────────────
  stopConfirmRequest: '🛑 ¿Confirmas la detención del motor? Toca ✅ Sí para confirmar.',
  stopConfirmSuccess: '🛑 Motor detenido. Ya puedes cerrar la terminal.',
  stopCancelled: '↩️ Detención cancelada. El motor sigue en marcha.',
  // ── emergency ─────────────────────────────────────────────────────────────
  emergencyResult: '🚨 Emergencia: motor frenado. Toma el control desde aquí.',
  // ── permisos / sistema ────────────────────────────────────────────────────
  permDeniedGeneric: '⛔ Lo siento, no tienes acceso a eso.',
  permDeniedControl: '🛡️ Solo un operador autorizado puede hacer eso.',
  engineNotInitialized:
    '🔄 El motor aún no está inicializado. Espera un momento e inténtalo de nuevo.',
  unknownCommand:
    '🤔 No entiendo eso. Usa los botones o envía /start para volver al menú principal.',
  invalidArgs: '❌ Algo salió mal. Inténtalo de nuevo desde el menú principal.',
  // ── notifications ──────────────────────────────────────────────────────────
  positionOpened: '📈 Posición abierta: {{symbol}} {{side}} — cantidad {{qty}} @ {{price}}',
  positionClosed: '📉 Posición cerrada: {{symbol}} — PnL {{pnl}}',
  positionClosedNoPnl: '📉 Posición cerrada: {{symbol}}',
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
  // ── панель /start ──────────────────────────────────────────────────────────
  startWelcome:
    '🚀 Добро пожаловать в PineFramework Bot!\n\n' +
    'Я присылаю сигналы ваших Pine-индикаторов прямо в этот чат, чтобы вы не упустили ни одного движения.\n\n' +
    'Управляйте всем кнопками ниже: оповещения, язык, отчёты и другое.\n' +
    'Операторы также найдут здесь управление движком и привязку групп.',
  // ── запрос доступа оператора ──────────────────────────────────────────────
  requestSubmitted: '✅ Запрос отправлен. Скоро ответим.',
  requestAlreadyPending: '⏳ У вас уже есть активный запрос — ожидайте.',
  requestAlreadyGranted: '✅ Вам уже выдан доступ. С возвращением!',
  // ── /subscribe ─────────────────────────────────────────────────────────────
  subscribeSuccess: '🔔 Вы подписаны — оповещения летят в этот чат.',
  subscribeFailure: '⚠️ Не удалось подписаться. Сначала убедитесь, что ваша ID подтверждена.',
  // ── /unsubscribe ───────────────────────────────────────────────────────────
  unsubscribeSuccess: '🔕 Вы отписались. Вернуться можно в любой момент через кнопки меню.',
  unsubscribeFailure: '⚠️ Не удалось отписаться — а вы вообще подписывались?',
  // ── меню управления уведомлениями ─────────────────────────────────────────
  notificationsMenuTitle:
    '🔔 Управление уведомлениями:\n\nНажмите на тип, чтобы включить или отключить оповещения для этого чата.',
  // ── язык ──────────────────────────────────────────────────────────────────
  langUsage: '🌐 Выберите предпочитаемый язык:',
  langInvalid: '❌ Недопустимый язык. Выберите один из: en, es, ru.',
  langCurrent: '🌐 Текущий язык: {{lang}}',
  langChanged: '🌐 Язык переключён: {{lang}} ✅',
  // ── /report ────────────────────────────────────────────────────────────────
  reportHeader: '📊 Итоги производительности',
  reportEmpty: '📊 Пока нет сделок. Появятся сигналы — всё увидите здесь.',
  reportRow: '• {{symbol}} {{side}} — PnL {{pnl}}',
  // ── link / unlink ─────────────────────────────────────────────────────────
  linkGroupOnly: '🔗 Привязка работает только в групповом чате.',
  linkConfirmRequest: '🔗 Привязать эту группу к вашему каналу? Оповещения будут приходить сюда.',
  linkSuccess: '✅ Группа привязана к вашему каналу. Оповещения придут сюда.',
  linkFail: '❌ Не удалось привязать группу. Убедитесь, что бот — админ и умеет писать в чат.',
  linkCancelled: '↩️ Привязка отменена — группа не изменилась.',
  unlinkConfirmRequest: '🔓 Отвязать эту группу? Оповещения перестанут приходить сюда.',
  unlinkSuccess: '🔓 Группа отвязана.',
  unlinkFail: '❌ Не удалось отвязать эту группу.',
  unlinkCancelled: '↩️ Отмена привязки — группа остаётся привязанной.',
  // ── /stats ─────────────────────────────────────────────────────────────────
  statsHeader: '⚙️ Состояние движка:',
  statsRunning: '🟢 Статус: работает. Полный боевой режим.',
  statsStopped: '⛔ Статус: остановлен. Запустите, чтобы возобновить автоматизацию.',
  statsError: '🚨 Статус: ошибка. Проверьте лог движка.',
  statsPairs: '⚡ Пар под присмотром: {{count}}',
  statsPositions: '　　 Открытых позиций: {{count}}',
  // ── /stop ──────────────────────────────────────────────────────────────────
  stopConfirmRequest: '🛑 Подтвердить остановку движка? Нажмите ✅ Да для подтверждения.',
  stopConfirmSuccess: '🛑 Движок остановлен. Терминал можно закрывать.',
  stopCancelled: '↩️ Остановка отменена. Движок продолжает работать.',
  // ── /emergency ─────────────────────────────────────────────────────────────
  emergencyResult: '🚨 Аварийно: движок остановлен, позиции — под контролем. Действуйте.',
  // ── permissions / system ──────────────────────────────────────────────────
  permDeniedGeneric: '⛔ К сожалению, у вас нет доступа к этому.',
  permDeniedControl: '🛡️ Это может сделать только авторизованный оператор.',
  engineNotInitialized: '🔄 Движок ещё не инициализирован. Подождите немного и попробуйте снова.',
  unknownCommand:
    '🤔 Я не понял. Используйте кнопки или отправьте /start, чтобы вернуться в главное меню.',
  invalidArgs: '❌ Что-то пошло не так. Попробуйте снова из главного меню.',
  positionOpened: '📈 Позиция открыта: {{symbol}} {{side}} — объём {{qty}} @ {{price}}',
  positionClosed: '📉 Позиция закрыта: {{symbol}} — PnL {{pnl}}',
  positionClosedNoPnl: '📉 Позиция закрыта: {{symbol}}',
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

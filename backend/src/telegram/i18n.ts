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
    'Operators also find the engine controls here.',
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
  // ── report (global PnL — stats merged in) ─────────────────────────────────
  reportHeader: '📊 *Global PnL Report*',
  reportTotal: '💰 *Total: {{total}}*',
  reportSplit: '🟢 Realized: {{realized}} · 🔵 Unrealized: {{unrealized}}',
  reportMetrics: '🧾 {{count}} trades · Win {{winRate}} · PF {{pf}}',
  reportTradeStats: '📈 Avg {{avg}} · 📉 Max DD {{dd}} · Fees {{fees}}',
  reportMovers: '🏆 Top movers:',
  reportSymbolRow: '• {{symbol}} — {{pnl}}',
  reportRecent: '🕑 Recent:',
  reportRow: '• {{symbol}} {{side}} — PnL {{pnl}}',
  reportEngine: '⚙️ Engine: {{state}} · 👀 {{pairs}} pairs · 📌 {{open}} open positions',
  reportEngineRunning: '🟢 running',
  reportEngineStopped: '⛔ stopped',
  reportEngineError: '🚨 error',
  reportEngineUnknown: '⚪ unknown',
  reportGenerated: '⏱ Generated {{time}}',
  reportImageError: '🖼️ Image unavailable — text report above.',
  // ── stop ──────────────────────────────────────────────────────────────────
  stopConfirmRequest: '🛑 Confirm engine stop? Tap ✅ Yes to confirm.',
  stopConfirmSuccess: '🛑 Engine stopped. It is safe to close the terminal.',
  stopCancelled: '↩️ Stop cancelled — engine keeps running.',
  // ── emergency ─────────────────────────────────────────────────────────────
  emergencyResult: '🚨 Emergency: engine halted and positions frozen. Take it from here.',
  emergencyCancelled: '↩️ Emergency cancelled.',
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
  // ── dashboard inline buttons (/start) ─────────────────────────────────────
  dashBtnManage: '🔔 Manage notifications',
  dashBtnLang: '🌐 Language',
  dashBtnReport: '📊 Report',
  dashBtnStop: '🛑 Stop',
  dashBtnEmergency: '🚨 Emergency',
  dashBtnRequest: '🪪 Request access',
  // ── shared inline keyboard buttons ────────────────────────────────────────
  btnConfirm: '✅ Yes, Stop',
  btnCancel: '❌ Cancel',
  btnEmergencyStop: '🚨 Emergency stop',
  btnBackMain: '↩️ Main menu',
  btnNotifEnableAll: '✅ Enable all',
  btnNotifDisableAll: '❌ Disable all',
  // ── notification-type display names ───────────────────────────────────────
  notifTypeTrading: 'Trading signals',
  notifTypePositionOpen: 'Position opened',
  notifTypePositionClose: 'Position closed',
  notifTypeReport: 'Reports',
  notifTypeDaily: 'Daily digest',
  notifTypeError: 'Errors',
  notifTypeBotLifecycle: 'Bot status',
  // ── report PnL card labels (renderCard.ts) ────────────────────────────────
  cardBrand: 'PINE FRAMEWORK',
  cardGlobal: 'GLOBAL PNL',
  cardRealized: 'REALIZED',
  cardUnrealized: 'UNREALIZED',
  cardNetRealizedUnrealized: 'Net realized + unrealized across all symbols',
  cardSymbolPnl: 'SYMBOL PNL',
  cardTopMovers: 'TOP MOVERS · |PnL|',
  cardWinRate: 'WIN RATE',
  cardProfitFactor: 'PROFIT FACTOR',
  cardAvgTrade: 'AVG TRADE',
  cardMaxDrawdown: 'MAX DRAWDOWN',
  cardOpenPositions: 'OPEN POSITIONS',
  cardGenerated: 'Generated {{time}}',
  cardEmptyState: 'No trades yet — awaiting the first signal',
  cardEngineRunning: 'Running',
  cardEngineStopped: 'Stopped',
  cardEngineError: 'Error',
  cardEngineUnknown: 'Unknown',
  cardFooter: 'PineFramework · {{report}}',
  cardReportWord: 'report',
  // ── backtest wizard (inline keyboards) ─────────────────────────────────────
  backtestStepStrategy: '📊 Pick a strategy to backtest:',
  backtestStepSymbol: '💱 Pick a symbol:',
  backtestStepTimeframe: '⏱ Pick a timeframe:',
  backtestStepDays: '🗓 Pick how far back to run:',
  backtestStepMethod: '🧮 Pick a commission method:',
  backtestStepRun: '🚀 Confirm backtest run:\n\n{{summary}}',
  backtestRunSummary: '📊 {{strategy}}\n💱 {{symbol}} {{timeframe}} · {{range}}\n🧮 {{method}}',
  backtestRunning: '⏳ Running backtest…',
  backtestRunDone: '✅ Backtest done! Result below.',
  backtestCancelConfirm: '↩️ Backtest cancelled.',
  backtestEmptyLibrary:
    '⚠️ No strategies available. Write a strategy first, then try /backtest again.',
  backtestAlreadyRunning: '⏳ A backtest is already running — wait for it to finish.',
  backtestErrNoStrategies: '⚠️ No strategies available to backtest.',
  backtestErrStrategyNotFound: '⚠️ Strategy not found. It may have been deleted — try again.',
  backtestErrNotAStrategy:
    '⚠️ That script is not a strategy (indicators and libraries cannot be backtested).',
  backtestErrTooManyBars:
    '⚠️ That range requests too many bars. Pick a shorter range or a larger timeframe.',
  backtestErrInvalidSettings: '⚠️ Invalid settings — check the strategy config and try again.',
  backtestErrFeeFetch: '⚠️ Could not fetch current fees. Try again in a moment.',
  backtestErrEngine: '⚠️ The backtest engine failed. Try again in a moment.',
  backtestErrDataFetch: '⚠️ Could not fetch market data. Try again in a moment.',
  backtestBtnBack: '↩️ Back',
  backtestBtnRestart: '🔄 Restart',
  backtestBtnRun: '🚀 Run',
  backtestMethodUltra: 'Jupiter Ultra',
  backtestMethodManual: 'Manual',
  // ── backtest result card (backtestCard.ts — no emoji, SVG text) ────────────
  backtestCardEngine: 'BACKTEST ENGINE',
  backtestCardNet: 'NET PNL',
  backtestCardSettings: 'SETTINGS',
  backtestCardSetSymbol: 'Symbol',
  backtestCardSetTimeframe: 'Timeframe',
  backtestCardSetRange: 'Range',
  backtestCardSetMethod: 'Method',
  backtestCardSetCapital: 'Capital',
  backtestCardPerformance: 'PERFORMANCE',
  backtestCardBarsAnnotation: '{{bars}} bars · backtest',
  backtestCardTrades: 'Trades',
  backtestCardWinRate: 'Win rate',
  backtestCardProfitFactor: 'Profit factor',
  backtestCardMaxDrawdown: 'Max drawdown',
  backtestCardSharpe: 'Sharpe',
  backtestCardBuyHold: 'Buy & hold',
  backtestCardCommission: 'Commission',
  backtestCardBars: 'Bars',
  backtestCardAvgTrade: 'Avg trade',
  backtestCardGenerated: 'Generated {{time}}',
  backtestCardFooter: 'PineFramework · backtest',
  // ── backtest text fallback (no image path) ─────────────────────────────────
  backtestTextTitle: '📊 *Backtest: {{strategy}}*',
  backtestTextSummary: '💱 {{symbol}} {{timeframe}} · {{range}} · 🧮 {{method}}',
  backtestTextMetrics:
    '💰 Net {{netPnl}} ({{pct}}) · 🧾 {{trades}} trades · Win {{winRate}} · PF {{pf}}',
  backtestTextStats: '📈 Avg {{avg}} · 📉 Max DD {{dd}} · Fees {{fees}}',
  backtestTextGenerated: '⏱ Generated {{time}}',
  backtestResultCaption: '📊 {{strategy}} · {{symbol}} {{timeframe}} · {{range}}',
} as const;

const es: Record<keyof typeof en, string> = {
  // ── panel de /start ────────────────────────────────────────────────────────
  startWelcome:
    '🚀 ¡Bienvenido a PineFramework Bot!\n\n' +
    'Te envío las señales de tus indicadores Pine a este chat, para que no te pierdas ni un movimiento.\n\n' +
    'Usa los botones de abajo para gestionar alertas, idioma, informes y más.\n' +
    'Los operadores también encuentran aquí los controles del motor.',
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
  // ── report (PnL global — estadísticas integradas) ─────────────────────────
  reportHeader: '📊 *Informe Global de PnL*',
  reportTotal: '💰 *Total: {{total}}*',
  reportSplit: '🟢 Realizado: {{realized}} · 🔵 No realizado: {{unrealized}}',
  reportMetrics: '🧾 {{count}} operaciones · Acierto {{winRate}} · PF {{pf}}',
  reportTradeStats: '📈 Promedio {{avg}} · 📉 Máx DD {{dd}} · Comisiones {{fees}}',
  reportMovers: '🏆 Mejores movimientos:',
  reportSymbolRow: '• {{symbol}} — {{pnl}}',
  reportRecent: '🕑 Recientes:',
  reportRow: '• {{symbol}} {{side}} — PnL {{pnl}}',
  reportEngine: '⚙️ Motor: {{state}} · 👀 {{pairs}} pares · 📌 {{open}} posiciones abiertas',
  reportEngineRunning: '🟢 en marcha',
  reportEngineStopped: '⛔ detenido',
  reportEngineError: '🚨 error',
  reportEngineUnknown: '⚪ desconocido',
  reportGenerated: '⏱ Generado {{time}}',
  reportImageError: '🖼️ Imagen no disponible — informe de texto arriba.',
  // ── stop ──────────────────────────────────────────────────────────────────
  stopConfirmRequest: '🛑 ¿Confirmas la detención del motor? Toca ✅ Sí para confirmar.',
  stopConfirmSuccess: '🛑 Motor detenido. Ya puedes cerrar la terminal.',
  stopCancelled: '↩️ Detención cancelada. El motor sigue en marcha.',
  // ── emergency ─────────────────────────────────────────────────────────────
  emergencyResult: '🚨 Emergencia: motor frenado. Toma el control desde aquí.',
  emergencyCancelled: '↩️ Emergencia cancelada.',
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
  // ── botones del panel /start ──────────────────────────────────────────────
  dashBtnManage: '🔔 Gestionar notificaciones',
  dashBtnLang: '🌐 Idioma',
  dashBtnReport: '📊 Informe',
  dashBtnStop: '🛑 Detener',
  dashBtnEmergency: '🚨 Emergencia',
  dashBtnRequest: '🪪 Solicitar acceso',
  // ── botones compartidos de teclados inline ────────────────────────────────
  btnConfirm: '✅ Sí, Detener',
  btnCancel: '❌ Cancelar',
  btnEmergencyStop: '🚨 Parada de emergencia',
  btnBackMain: '↩️ Menú principal',
  btnNotifEnableAll: '✅ Activar todas',
  btnNotifDisableAll: '❌ Desactivar todas',
  // ── nombres de tipos de notificación ──────────────────────────────────────
  notifTypeTrading: 'Señales de trading',
  notifTypePositionOpen: 'Posición abierta',
  notifTypePositionClose: 'Posición cerrada',
  notifTypeReport: 'Informes',
  notifTypeDaily: 'Resumen diario',
  notifTypeError: 'Errores',
  notifTypeBotLifecycle: 'Estado del bot',
  // ── etiquetas de la tarjeta de informe PnL (renderCard.ts) ────────────────
  cardBrand: 'PINE FRAMEWORK',
  cardGlobal: 'PNL GLOBAL',
  cardRealized: 'REALIZADO',
  cardUnrealized: 'NO REALIZADO',
  cardNetRealizedUnrealized: 'NETO REALIZADO + NO REALIZADO EN TODOS LOS SÍMBOLOS',
  cardSymbolPnl: 'PNL POR SÍMBOLO',
  cardTopMovers: 'MEJORES MOVIMIENTOS · |PnL|',
  cardWinRate: 'RATIO DE ACIERTO',
  cardProfitFactor: 'FACTOR DE BENEFICIO',
  cardAvgTrade: 'OP. MEDIA',
  cardMaxDrawdown: 'MÁX. RETROCESO',
  cardOpenPositions: 'POSICIONES ABIERTAS',
  cardGenerated: 'Generado {{time}}',
  cardEmptyState: 'Aún no hay operaciones — a la espera de la primera señal',
  cardEngineRunning: 'En marcha',
  cardEngineStopped: 'Detenido',
  cardEngineError: 'Error',
  cardEngineUnknown: 'Desconocido',
  cardFooter: 'PineFramework · {{report}}',
  cardReportWord: 'informe',
  // ── asistente de backtest (teclados inline) ────────────────────────────────
  backtestStepStrategy: '📊 Elige una estrategia para backtestear:',
  backtestStepSymbol: '💱 Elige un símbolo:',
  backtestStepTimeframe: '⏱ Elige un timeframe:',
  backtestStepDays: '🗓 Elige hasta dónde mirar atrás:',
  backtestStepMethod: '🧮 Elige un método de comisión:',
  backtestStepRun: '🚀 Confirma la ejecución del backtest:\n\n{{summary}}',
  backtestRunSummary: '📊 {{strategy}}\n💱 {{symbol}} {{timeframe}} · {{range}}\n🧮 {{method}}',
  backtestRunning: '⏳ Ejecutando backtest…',
  backtestRunDone: '✅ ¡Backtest completado! Resultado abajo.',
  backtestCancelConfirm: '↩️ Backtest cancelado.',
  backtestEmptyLibrary:
    '⚠️ No hay estrategias disponibles. Escribe una estrategia primero y vuelve a /backtest.',
  backtestAlreadyRunning: '⏳ Ya hay un backtest en curso — espera a que termine.',
  backtestErrNoStrategies: '⚠️ No hay estrategias disponibles para backtestear.',
  backtestErrStrategyNotFound:
    '⚠️ Estrategia no encontrada. Puede que se haya eliminado — inténtalo de nuevo.',
  backtestErrNotAStrategy:
    '⚠️ Ese script no es una estrategia (los indicadores y librerías no se pueden backtestear).',
  backtestErrTooManyBars:
    '⚠️ Ese rango pide demasiadas barras. Elige un rango más corto o un timeframe mayor.',
  backtestErrInvalidSettings:
    '⚠️ Ajustes no válidos — revisa la configuración de la estrategia e inténtalo de nuevo.',
  backtestErrFeeFetch:
    '⚠️ No se pudieron obtener las comisiones actuales. Inténtalo en un momento.',
  backtestErrEngine: '⚠️ El motor de backtest falló. Inténtalo en un momento.',
  backtestErrDataFetch: '⚠️ No se pudieron obtener los datos del mercado. Inténtalo en un momento.',
  backtestBtnBack: '↩️ Atrás',
  backtestBtnRestart: '🔄 Reiniciar',
  backtestBtnRun: '🚀 Ejecutar',
  backtestMethodUltra: 'Jupiter Ultra',
  backtestMethodManual: 'Manual',
  // ── tarjeta de resultado del backtest (backtestCard.ts — sin emoji) ────────
  backtestCardEngine: 'MOTOR DE BACKTEST',
  backtestCardNet: 'PNL NETO',
  backtestCardSettings: 'CONFIGURACIÓN',
  backtestCardSetSymbol: 'Símbolo',
  backtestCardSetTimeframe: 'Timeframe',
  backtestCardSetRange: 'Rango',
  backtestCardSetMethod: 'Método',
  backtestCardSetCapital: 'Capital',
  backtestCardPerformance: 'RENDIMIENTO',
  backtestCardBarsAnnotation: '{{bars}} barras · backtest',
  backtestCardTrades: 'Operaciones',
  backtestCardWinRate: 'Tasa de acierto',
  backtestCardProfitFactor: 'Factor de beneficio',
  backtestCardMaxDrawdown: 'Máx. drawdown',
  backtestCardSharpe: 'Sharpe',
  backtestCardBuyHold: 'Buy & hold',
  backtestCardCommission: 'Comisión',
  backtestCardBars: 'Barras',
  backtestCardAvgTrade: 'Operación media',
  backtestCardGenerated: 'Generado {{time}}',
  backtestCardFooter: 'PineFramework · backtest',
  // ── respaldo de texto del backtest (sin imagen) ────────────────────────────
  backtestTextTitle: '📊 *Backtest: {{strategy}}*',
  backtestTextSummary: '💱 {{symbol}} {{timeframe}} · {{range}} · 🧮 {{method}}',
  backtestTextMetrics:
    '💰 Neto {{netPnl}} ({{pct}}) · 🧾 {{trades}} operaciones · Acierto {{winRate}} · PF {{pf}}',
  backtestTextStats: '📈 Media {{avg}} · 📉 Máx. DD {{dd}} · Comisiones {{fees}}',
  backtestTextGenerated: '⏱ Generado {{time}}',
  backtestResultCaption: '📊 {{strategy}} · {{symbol}} {{timeframe}} · {{range}}',
};

const ru: Record<keyof typeof en, string> = {
  // ── панель /start ──────────────────────────────────────────────────────────
  startWelcome:
    '🚀 Добро пожаловать в PineFramework Bot!\n\n' +
    'Я присылаю сигналы ваших Pine-индикаторов прямо в этот чат, чтобы вы не упустили ни одного движения.\n\n' +
    'Управляйте всем кнопками ниже: оповещения, язык, отчёты и другое.\n' +
    'Операторы также найдут здесь управление движком.',
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
  // ── /report (глобальный PnL — статистика объединена) ──────────────────────
  reportHeader: '📊 *Глобальный отчёт по PnL*',
  reportTotal: '💰 *Итого: {{total}}*',
  reportSplit: '🟢 Реализовано: {{realized}} · 🔵 Нереализовано: {{unrealized}}',
  reportMetrics: '🧾 Сделок: {{count}} · Винрейт {{winRate}} · PF {{pf}}',
  reportTradeStats: '📈 Средняя {{avg}} · 📉 Макс. DD {{dd}} · Комиссии {{fees}}',
  reportMovers: '🏆 Топ-движения:',
  reportSymbolRow: '• {{symbol}} — {{pnl}}',
  reportRecent: '🕑 Недавние:',
  reportRow: '• {{symbol}} {{side}} — PnL {{pnl}}',
  reportEngine: '⚙️ Движок: {{state}} · 👀 Пар: {{pairs}} · 📌 Открытых позиций: {{open}}',
  reportEngineRunning: '🟢 работает',
  reportEngineStopped: '⛔ остановлен',
  reportEngineError: '🚨 ошибка',
  reportEngineUnknown: '⚪ неизвестно',
  reportGenerated: '⏱ Создано {{time}}',
  reportImageError: '🖼️ Изображение недоступно — текстовый отчёт выше.',
  // ── /stop ──────────────────────────────────────────────────────────────────
  stopConfirmRequest: '🛑 Подтвердить остановку движка? Нажмите ✅ Да для подтверждения.',
  stopConfirmSuccess: '🛑 Движок остановлен. Терминал можно закрывать.',
  stopCancelled: '↩️ Остановка отменена. Движок продолжает работать.',
  // ── /emergency ─────────────────────────────────────────────────────────────
  emergencyResult: '🚨 Аварийно: движок остановлен, позиции — под контролем. Действуйте.',
  emergencyCancelled: '↩️ Аварийный стоп отменён.',
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
  // ── кнопки панели /start ──────────────────────────────────────────────────
  dashBtnManage: '🔔 Управлять уведомлениями',
  dashBtnLang: '🌐 Язык',
  dashBtnReport: '📊 Отчёт',
  dashBtnStop: '🛑 Стоп',
  dashBtnEmergency: '🚨 Аварийная остановка',
  dashBtnRequest: '🪪 Запросить доступ',
  // ── общие кнопки инлайн-клавиатур ────────────────────────────────────────
  btnConfirm: '✅ Да, остановить',
  btnCancel: '❌ Отмена',
  btnEmergencyStop: '🚨 Аварийный стоп',
  btnBackMain: '↩️ Главное меню',
  btnNotifEnableAll: '✅ Включить все',
  btnNotifDisableAll: '❌ Отключить все',
  // ── названия типов уведомлений ────────────────────────────────────────────
  notifTypeTrading: 'Торговые сигналы',
  notifTypePositionOpen: 'Позиция открыта',
  notifTypePositionClose: 'Позиция закрыта',
  notifTypeReport: 'Отчёты',
  notifTypeDaily: 'Дневной дайджест',
  notifTypeError: 'Ошибки',
  notifTypeBotLifecycle: 'Статус бота',
  // ── подписи карточки отчёта PnL (renderCard.ts) ──────────────────────────
  cardBrand: 'PINE FRAMEWORK',
  cardGlobal: 'ГЛОБАЛЬНЫЙ PNL',
  cardRealized: 'РЕАЛИЗОВАНО',
  cardUnrealized: 'НЕРЕАЛИЗОВАНО',
  cardNetRealizedUnrealized: 'НЕТТО РЕАЛИЗОВАННЫЙ + НЕРЕАЛИЗОВАННЫЙ ПО ВСЕМ СИМВОЛАМ',
  cardSymbolPnl: 'PNL ПО СИМВОЛУ',
  cardTopMovers: 'ТОП-ДВИЖЕНИЯ · |PnL|',
  cardWinRate: 'ВИНРЕЙТ',
  cardProfitFactor: 'ФАКТОР ПРИБЫЛИ',
  cardAvgTrade: 'СРЕДНЯЯ СДЕЛКА',
  cardMaxDrawdown: 'МАКС. ПРОСАДКА',
  cardOpenPositions: 'ОТКРЫТЫЕ ПОЗИЦИИ',
  cardGenerated: 'Создано {{time}}',
  cardEmptyState: 'Сделок пока нет — ждём первый сигнал',
  cardEngineRunning: 'Работает',
  cardEngineStopped: 'Остановлен',
  cardEngineError: 'Ошибка',
  cardEngineUnknown: 'Неизвестно',
  cardFooter: 'PineFramework · {{report}}',
  cardReportWord: 'отчёт',
  // ── мастер бэктеста (инлайн-клавиатуры) ───────────────────────────────────
  backtestStepStrategy: '📊 Выберите стратегию для бэктеста:',
  backtestStepSymbol: '💱 Выберите символ:',
  backtestStepTimeframe: '⏱ Выберите таймфрейм:',
  backtestStepDays: '🗓 Выберите глубину истории:',
  backtestStepMethod: '🧮 Выберите метод комиссии:',
  backtestStepRun: '🚀 Подтвердите запуск бэктеста:\n\n{{summary}}',
  backtestRunSummary: '📊 {{strategy}}\n💱 {{symbol}} {{timeframe}} · {{range}}\n🧮 {{method}}',
  backtestRunning: '⏳ Запускаем бэктест…',
  backtestRunDone: '✅ Бэктест завершён! Результат ниже.',
  backtestCancelConfirm: '↩️ Бэктест отменён.',
  backtestEmptyLibrary:
    '⚠️ Нет доступных стратегий. Сначала напишите стратегию, затем снова /backtest.',
  backtestAlreadyRunning: '⏳ Бэктест уже выполняется — дождитесь завершения.',
  backtestErrNoStrategies: '⚠️ Нет стратегий для бэктеста.',
  backtestErrStrategyNotFound:
    '⚠️ Стратегия не найдена. Возможно, она была удалена — попробуйте снова.',
  backtestErrNotAStrategy: '⚠️ Это не стратегия (индикаторы и библиотеки нельзя бэктестить).',
  backtestErrTooManyBars:
    '⚠️ Слишком много баров для этого диапазона. Выберите меньший диапазон или больший таймфрейм.',
  backtestErrInvalidSettings:
    '⚠️ Неверные настройки — проверьте конфигурацию стратегии и попробуйте снова.',
  backtestErrFeeFetch: '⚠️ Не удалось получить текущие комиссии. Попробуйте чуть позже.',
  backtestErrEngine: '⚠️ Движок бэктеста не сработал. Попробуйте чуть позже.',
  backtestErrDataFetch: '⚠️ Не удалось получить рыночные данные. Попробуйте чуть позже.',
  backtestBtnBack: '↩️ Назад',
  backtestBtnRestart: '🔄 Заново',
  backtestBtnRun: '🚀 Запустить',
  backtestMethodUltra: 'Jupiter Ultra',
  backtestMethodManual: 'Вручную',
  // ── карточка результата бэктеста (backtestCard.ts — без эмодзи) ────────────
  backtestCardEngine: 'ДВИЖОК БЭКТЕСТА',
  backtestCardNet: 'ЧИСТЫЙ PNL',
  backtestCardSettings: 'НАСТРОЙКИ',
  backtestCardSetSymbol: 'Символ',
  backtestCardSetTimeframe: 'Таймфрейм',
  backtestCardSetRange: 'Диапазон',
  backtestCardSetMethod: 'Метод',
  backtestCardSetCapital: 'Капитал',
  backtestCardPerformance: 'РЕЗУЛЬТАТ',
  backtestCardBarsAnnotation: '{{bars}} баров · бэктест',
  backtestCardTrades: 'Сделки',
  backtestCardWinRate: 'Винрейт',
  backtestCardProfitFactor: 'Фактор прибыли',
  backtestCardMaxDrawdown: 'Макс. просадка',
  backtestCardSharpe: 'Шарп',
  backtestCardBuyHold: 'Buy & hold',
  backtestCardCommission: 'Комиссия',
  backtestCardBars: 'Бары',
  backtestCardAvgTrade: 'Средняя сделка',
  backtestCardGenerated: 'Создано {{time}}',
  backtestCardFooter: 'PineFramework · бэктест',
  // ── текстовый запасной вариант бэктеста (без изображения) ──────────────────
  backtestTextTitle: '📊 *Бэктест: {{strategy}}*',
  backtestTextSummary: '💱 {{symbol}} {{timeframe}} · {{range}} · 🧮 {{method}}',
  backtestTextMetrics:
    '💰 Нетто {{netPnl}} ({{pct}}) · 🧾 {{trades}} сделок · Винрейт {{winRate}} · PF {{pf}}',
  backtestTextStats: '📈 Средняя {{avg}} · 📉 Макс. DD {{dd}} · Комиссии {{fees}}',
  backtestTextGenerated: '⏱ Создано {{time}}',
  backtestResultCaption: '📊 {{strategy}} · {{symbol}} {{timeframe}} · {{range}}',
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

/**
 * I18n type definitions — single source of truth for all translatable keys.
 * Every key must be present in every locale file.
 */
export interface LocaleMessages {
  // ── App ──
  'app.title': string

  // ── Nav Toolbar ──
  'nav.placeholder': string
  'nav.backTooltip': string
  'nav.forwardTooltip': string
  'nav.reloadTooltip': string

  // ── Sidebar ──
  'sidebar.inputPlaceholder': string
  'sidebar.inputPlaceholderKb': string

  // ── Detected Fields ──
  'fields.title': string
  'fields.tabFields': string
  'fields.tabTree': string
  'fields.rescan': string
  'fields.empty': string
  'fields.emptyDesc': string
  'fields.noAxData': string
  'fields.required': string
  'fields.copy': string
  'fields.nodesInfo': string

  // ── Page Summary ──
  'summary.loading': string
  'summary.error': string
  'summary.retry': string
  'summary.refresh': string
  'summary.title': string
  'summary.emptyHint': string
  'summary.badgeLoading': string
  'summary.noModelConfigured': string
  'summary.configureModel': string

  // ── Model Config Cards ──
  'model.emptyTitle': string
  'model.emptyDesc': string
  'model.activeBadge': string
  'model.edit': string
  'model.delete': string
  'model.confirmDelete': string
  'model.setActive': string
  'model.testConnection': string
  'model.retest': string
  'model.testSuccess': string
  'model.testFailed': string
  'model.connectionFailed': string
  'model.sourceLocal': string
  'model.sourceRemote': string

  // ── Model Dialog ──
  'modelDialog.addTitle': string
  'modelDialog.editTitle': string
  'modelDialog.provider': string
  'modelDialog.modelName': string
  'modelDialog.modelNamePlaceholder': string
  'modelDialog.displayName': string
  'modelDialog.displayNameOptional': string
  'modelDialog.displayNamePlaceholder': string
  'modelDialog.baseUrl': string
  'modelDialog.apiKey': string
  'modelDialog.apiKeyPlaceholder': string
  'modelDialog.show': string
  'modelDialog.hide': string
  'modelDialog.customHeaders': string
  'modelDialog.addHeader': string
  'modelDialog.headerName': string
  'modelDialog.headerValue': string
  'modelDialog.removeHeader': string
  'modelDialog.advanced': string
  'modelDialog.temperature': string
  'modelDialog.tempDeterministic': string
  'modelDialog.tempCreative': string
  'modelDialog.maxTokens': string
  'modelDialog.cancel': string
  'modelDialog.save': string
  'modelDialog.close': string
  'modelDialog.saveFailed': string
  'modelDialog.saveStorageFailed': string

  // ── Language Settings ──
  'lang.uiLang': string
  'lang.uiLangDesc': string
  'lang.outputLang': string
  'lang.outputLangDesc': string
  'lang.outputLangWarning': string

  // ── Settings Dialog ──
  'settings.title': string
  'settings.models': string
  'settings.language': string
  'settings.modelsTitle': string
  'settings.modelsDesc': string
  'settings.languageTitle': string
  'settings.languageDesc': string
  'settings.addModel': string
  'settings.close': string

  // ── Chat ──
  'chat.selectModel': string
  'chat.manageModels': string
  'chat.stop': string
  'chat.stopTooltip': string
  'chat.sendTooltip': string
  'chat.welcome': string
  'chat.welcomeSubtitle': string
  'chat.welcomeTipActive': string
  'chat.welcomeTipSubtitle': string

  // ── AI Tip ──
  'aiTip.title': string
  'aiTip.dismiss': string
  'aiTip.hasValue': string
  'aiTip.customQuestion': string
  'aiTip.customPlaceholder': string
  'aiTip.cancel': string
  'aiTip.ask': string
  'aiTip.thisField': string

  // ── Suggestion Chips ──
  'chips.whatToFill': string
  'chips.listOptions': string
  'chips.polishText': string
  'chips.writeDraft': string
  'chips.suggestEmail': string
  'chips.helpSearch': string
  'chips.improveInput': string
  'chips.formatHelp': string
  'chips.summarize': string
  'chips.searchKb': string
  'chips.analyzeStructure': string
  'chips.extractFields': string
  'chips.tellMore': string
  'chips.showMore': string
  'chips.showLess': string
  'chips.suggestionsFor': string

  // ── Bot Message ──
  'bot.fill': string
  'bot.filling': string
  'bot.filled': string
  'bot.notFound': string
  'bot.fillDraft': string

  // ── Context Pill ──
  'context.clear': string

  // ── Quick Actions ──
  'quick.summarize': string
  'quick.searchKb': string

  // ── Welcome / Onboarding ──
  'welcome.greeting': string
  'welcome.greetingSubtitle': string
  'welcome.pageSummaryLabel': string
  'welcome.fieldsDetected': string
  'welcome.fieldsDetected_none': string
  'welcome.tryThese': string
  'welcome.summarizePage': string
  'welcome.fillForm': string
  'welcome.explainForm': string
  'welcome.analyzeFields': string
  'welcome.tipsTitle': string
  'welcome.tip1': string
  'welcome.tip2': string
  'welcome.tip3': string
  'welcome.tip4': string
  'welcome.dismissTips': string
  'welcome.showTips': string

  // ── AI Tip preload prompts ──
  'webview.aiButtonTitle': string

  // ── Misc ──
  'misc.unknown': string
  'misc.noModel': string
  'misc.promptUrl': string

  // ── Batch Fill ──
  'batchFill.triggerTitle': string
  'batchFill.triggerDesc': string
  'batchFill.startBtn': string
  'batchFill.loadingTitle': string
  'batchFill.doneTitle': string
  'batchFill.autoFilled': string
  'batchFill.needsReview': string
  'batchFill.lowConfidence': string
  'batchFill.viewAllBtn': string

  // ── Field Suggestion Card ──
  'suggestion.title': string
  'suggestion.confidenceHigh': string
  'suggestion.confidenceMedium': string
  'suggestion.confidenceLow': string
  'suggestion.empty': string
  'suggestion.reason': string
  'suggestion.acceptBtn': string
  'suggestion.reSuggestBtn': string
  'suggestion.filled': string

  // ── Common ──
  'common.cancel': string
  'common.retry': string
  'common.dismiss': string
}

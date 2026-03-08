// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface DataSerializerDeps {
  stringifyTriggerScripts: (ts: any) => string;
  normalizeTriggerScripts: (ts: any) => any[];
  extractPrimaryLuaFromTriggerScripts: (ts: any) => string;
  mergePrimaryLuaIntoTriggerScripts: (ts: any, lua: string) => any[];
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

let deps: DataSerializerDeps;

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

export function initDataSerializer(d: DataSerializerDeps): void {
  deps = d;
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/** Filter data for safe transfer to renderer (strips binary assets / internal fields). */
export function serializeForRenderer(data: any): Record<string, any> {
  const result: Record<string, any> = {
    _fileType: data._fileType || 'charx',
    name: data.name,
    description: data.description,
    firstMessage: data.firstMessage,
    triggerScripts: deps.stringifyTriggerScripts(data.triggerScripts),
    alternateGreetings: data.alternateGreetings || [],
    groupOnlyGreetings: data.groupOnlyGreetings || [],
    globalNote: data.globalNote,
    css: data.css,
    defaultVariables: data.defaultVariables,
    lua: data.lua,
    lorebook: data.lorebook,
    regex: data.regex,
    moduleName: data.moduleName,
  };

  // Include charx card.data fields (always present for charx files)
  if (data._fileType !== 'risup') {
    result.personality = data.personality || '';
    result.scenario = data.scenario || '';
    result.creatorcomment = data.creatorcomment || '';
    result.tags = data.tags || [];
    result.exampleMessage = data.exampleMessage || '';
    result.systemPrompt = data.systemPrompt || '';
    result.creator = data.creator || '';
    result.characterVersion = data.characterVersion || '';
    result.nickname = data.nickname || '';
    result.source = data.source || [];
    result.creationDate = typeof data.creationDate === 'number' ? data.creationDate : 0;
    result.modificationDate = typeof data.modificationDate === 'number' ? data.modificationDate : 0;
    result.additionalText = data.additionalText || '';
    result.license = data.license || '';
  }

  // Include risum module-specific fields
  if (data._fileType === 'risum' || data.cjs !== undefined) {
    result.moduleId = data.moduleId || '';
    result.moduleDescription = data.moduleDescription || '';
    result.cjs = data.cjs || '';
    result.lowLevelAccess = !!data.lowLevelAccess;
    result.hideIcon = !!data.hideIcon;
    result.backgroundEmbedding = data.backgroundEmbedding || '';
    result.moduleNamespace = data.moduleNamespace || '';
    result.customModuleToggle = data.customModuleToggle || '';
    result.mcpUrl = data.mcpUrl || '';
  }

  // Include risup preset fields
  if (data._fileType === 'risup') {
    // Basic
    result.mainPrompt = data.mainPrompt || '';
    result.jailbreak = data.jailbreak || '';
    result.temperature = typeof data.temperature === 'number' ? data.temperature : 80;
    result.maxContext = typeof data.maxContext === 'number' ? data.maxContext : 4000;
    result.maxResponse = typeof data.maxResponse === 'number' ? data.maxResponse : 300;
    result.frequencyPenalty = typeof data.frequencyPenalty === 'number' ? data.frequencyPenalty : 70;
    result.presencePenalty = typeof data.presencePenalty === 'number' ? data.presencePenalty : 70;
    result.aiModel = data.aiModel || '';
    result.subModel = data.subModel || '';
    result.apiType = data.apiType || '';
    result.promptPreprocess = !!data.promptPreprocess;
    result.promptTemplate = data.promptTemplate || '[]';
    result.presetBias = data.presetBias || '[]';
    result.formatingOrder = data.formatingOrder || '[]';
    result.presetImage = data.presetImage || '';

    // Sampling
    if (data.top_p !== undefined) result.top_p = data.top_p;
    if (data.top_k !== undefined) result.top_k = data.top_k;
    if (data.repetition_penalty !== undefined) result.repetition_penalty = data.repetition_penalty;
    if (data.min_p !== undefined) result.min_p = data.min_p;
    if (data.top_a !== undefined) result.top_a = data.top_a;

    // Thinking / reasoning
    if (data.reasonEffort !== undefined) result.reasonEffort = data.reasonEffort;
    if (data.thinkingTokens !== undefined) result.thinkingTokens = data.thinkingTokens;
    if (data.thinkingType !== undefined) result.thinkingType = data.thinkingType;
    if (data.adaptiveThinkingEffort !== undefined) result.adaptiveThinkingEffort = data.adaptiveThinkingEffort;

    // Templates & formatting
    if (data.useInstructPrompt !== undefined) result.useInstructPrompt = data.useInstructPrompt;
    if (data.instructChatTemplate !== undefined) result.instructChatTemplate = data.instructChatTemplate;
    if (data.JinjaTemplate !== undefined) result.JinjaTemplate = data.JinjaTemplate;
    if (data.customPromptTemplateToggle !== undefined)
      result.customPromptTemplateToggle = data.customPromptTemplateToggle;
    if (data.templateDefaultVariables !== undefined) result.templateDefaultVariables = data.templateDefaultVariables;
    if (data.moduleIntergration !== undefined) result.moduleIntergration = data.moduleIntergration;

    // JSON schema
    if (data.jsonSchemaEnabled !== undefined) result.jsonSchemaEnabled = data.jsonSchemaEnabled;
    if (data.jsonSchema !== undefined) result.jsonSchema = data.jsonSchema;
    if (data.strictJsonSchema !== undefined) result.strictJsonSchema = data.strictJsonSchema;
    if (data.extractJson !== undefined) result.extractJson = data.extractJson;

    // Group & misc
    if (data.groupTemplate !== undefined) result.groupTemplate = data.groupTemplate;
    if (data.groupOtherBotRole !== undefined) result.groupOtherBotRole = data.groupOtherBotRole;
    if (data.autoSuggestPrompt !== undefined) result.autoSuggestPrompt = data.autoSuggestPrompt;
    if (data.autoSuggestPrefix !== undefined) result.autoSuggestPrefix = data.autoSuggestPrefix;
    if (data.autoSuggestClean !== undefined) result.autoSuggestClean = data.autoSuggestClean;
    if (data.localStopStrings !== undefined) result.localStopStrings = data.localStopStrings;
    if (data.outputImageModal !== undefined) result.outputImageModal = data.outputImageModal;
    if (data.verbosity !== undefined) result.verbosity = data.verbosity;
    if (data.fallbackWhenBlankResponse !== undefined) result.fallbackWhenBlankResponse = data.fallbackWhenBlankResponse;
    if (data.systemContentReplacement !== undefined) result.systemContentReplacement = data.systemContentReplacement;
    if (data.systemRoleReplacement !== undefined) result.systemRoleReplacement = data.systemRoleReplacement;
  }
  return result;
}

/** Apply field updates with validation; keeps triggerScripts ↔ lua in sync. */
export function applyUpdates(data: any, fields: any): void {
  if (!fields) return;
  const allowed = [
    'name',
    'description',
    'firstMessage',
    'alternateGreetings',
    'groupOnlyGreetings',
    'globalNote',
    'css',
    'defaultVariables',
    'triggerScripts',
    'lua',
    'lorebook',
    'regex',
  ];
  // Charx card.data fields
  const charxAllowed = [
    'personality',
    'scenario',
    'creatorcomment',
    'tags',
    'exampleMessage',
    'systemPrompt',
    'creator',
    'characterVersion',
    'nickname',
    'source',
    'creationDate',
    'modificationDate',
    'additionalText',
    'license',
  ];
  // Risum module-specific fields (always safe to allow — no-ops on charx)
  const risumAllowed = [
    'moduleName',
    'moduleDescription',
    'cjs',
    'lowLevelAccess',
    'hideIcon',
    'backgroundEmbedding',
    'moduleNamespace',
    'customModuleToggle',
    'mcpUrl',
  ];
  // Risup preset fields
  const risupAllowed = [
    'mainPrompt',
    'jailbreak',
    'temperature',
    'maxContext',
    'maxResponse',
    'frequencyPenalty',
    'presencePenalty',
    'aiModel',
    'subModel',
    'apiType',
    'promptPreprocess',
    'promptTemplate',
    'presetBias',
    'formatingOrder',
    'presetImage',
    // Sampling
    'top_p',
    'top_k',
    'repetition_penalty',
    'min_p',
    'top_a',
    // Thinking / reasoning
    'reasonEffort',
    'thinkingTokens',
    'thinkingType',
    'adaptiveThinkingEffort',
    // Templates & formatting
    'useInstructPrompt',
    'instructChatTemplate',
    'JinjaTemplate',
    'customPromptTemplateToggle',
    'templateDefaultVariables',
    'moduleIntergration',
    // JSON schema
    'jsonSchemaEnabled',
    'jsonSchema',
    'strictJsonSchema',
    'extractJson',
    // Group & misc
    'groupTemplate',
    'groupOtherBotRole',
    'autoSuggestPrompt',
    'autoSuggestPrefix',
    'autoSuggestClean',
    'localStopStrings',
    'outputImageModal',
    'verbosity',
    'fallbackWhenBlankResponse',
    'systemContentReplacement',
    'systemRoleReplacement',
  ];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      if (key === 'triggerScripts') {
        data.triggerScripts = deps.normalizeTriggerScripts(fields.triggerScripts);
        data.lua = deps.extractPrimaryLuaFromTriggerScripts(data.triggerScripts);
        continue;
      }
      data[key] = fields[key];
      if (key === 'lua') {
        data.triggerScripts = deps.mergePrimaryLuaIntoTriggerScripts(data.triggerScripts, data.lua);
      }
    }
  }
  for (const key of charxAllowed) {
    if (fields[key] !== undefined) {
      data[key] = fields[key];
    }
  }
  for (const key of risumAllowed) {
    if (fields[key] !== undefined) {
      data[key] = fields[key];
    }
  }
  for (const key of risupAllowed) {
    if (fields[key] !== undefined) {
      data[key] = fields[key];
    }
  }
  // CSS 필드에 <style> 태그가 없으면 강제로 감싸기
  if (fields.css !== undefined && data.css && data.css.trim()) {
    if (!/<style[\s>]/i.test(data.css)) {
      data.css = '<style>\n' + data.css + '\n</style>';
    }
  }
}

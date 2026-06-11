// Temp script: decode a .risup preset and dump prompt-relevant fields as JSON
const path = require('path');
const fs = require('fs');
const { openRisup } = require('./src/charx-io.js');

const file = process.argv[2];
const out = process.argv[3];
const data = openRisup(file);

const dump = {
  name: data.name,
  promptTemplate: data.promptTemplate,
  formatingOrder: data.formatingOrder,
  customPromptTemplateToggle: data.customPromptTemplateToggle,
  templateDefaultVariables: data.templateDefaultVariables,
  globalNote: data.globalNote,
  mainPrompt: data.mainPrompt,
  jailbreak: data.jailbreak,
  autoSuggestPrompt: data.autoSuggestPrompt,
  promptSettings: data.promptSettings,
  aiModel: data.aiModel,
  subModel: data.subModel,
  maxContext: data.maxContext,
  maxResponse: data.maxResponse,
  temperature: data.temperature,
  regex: Array.isArray(data.regex) ? data.regex.length : data.regex,
};
fs.writeFileSync(out, JSON.stringify(dump, null, 2), 'utf8');
console.log('OK', out);

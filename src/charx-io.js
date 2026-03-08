'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const { rpackDecode, rpackEncode, parseRisum, buildRisum } = require('./rpack');
const { pack, unpack } = require('msgpackr');
const { risuArrayToCCV3 } = require('./lorebook-convert');
const ZIP_LOCAL_FILE_HEADER = Buffer.from([0x50, 0x4B, 0x03, 0x04]);
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
/** Extract risum module-specific fields from a parsed module object. */
function extractRisumModuleFields(mod) {
    const mcp = mod.mcp;
    return {
        cjs: mod.cjs || '',
        lowLevelAccess: !!(mod.lowLevelAccess),
        hideIcon: !!(mod.hideIcon),
        backgroundEmbedding: mod.backgroundEmbedding || '',
        moduleNamespace: mod.namespace || '',
        customModuleToggle: mod.customModuleToggle || '',
        mcpUrl: mcp?.url || '',
    };
}
/** Write risum module-specific fields back into a module JSON object. */
function applyRisumModuleFields(mod, data) {
    if (data.cjs !== undefined)
        mod.cjs = data.cjs || undefined;
    mod.lowLevelAccess = data.lowLevelAccess || false;
    mod.hideIcon = data.hideIcon || false;
    if (data.backgroundEmbedding !== undefined)
        mod.backgroundEmbedding = data.backgroundEmbedding || undefined;
    if (data.moduleNamespace !== undefined)
        mod.namespace = data.moduleNamespace || undefined;
    if (data.customModuleToggle !== undefined)
        mod.customModuleToggle = data.customModuleToggle || undefined;
    if (data.mcpUrl) {
        mod.mcp = { url: data.mcpUrl };
    }
    else if (data.mcpUrl === '') {
        delete mod.mcp;
    }
}
function cloneTriggerScripts(triggerScripts) {
    return Array.isArray(triggerScripts)
        ? JSON.parse(JSON.stringify(triggerScripts))
        : [];
}
function extractPrimaryLuaFromTriggerScripts(triggerScripts) {
    if (!Array.isArray(triggerScripts))
        return '';
    for (const trigger of triggerScripts) {
        const effects = Array.isArray(trigger?.effect) ? trigger.effect : [];
        for (const effect of effects) {
            if (effect && typeof effect.code === 'string' && (effect.type === 'triggerlua' || typeof effect.type !== 'string')) {
                return effect.code;
            }
        }
    }
    return '';
}
function normalizeTriggerScripts(triggerScripts) {
    if (Array.isArray(triggerScripts)) {
        return cloneTriggerScripts(triggerScripts);
    }
    if (typeof triggerScripts === 'string') {
        const trimmed = triggerScripts.trim();
        if (!trimmed)
            return [];
        const parsed = JSON.parse(trimmed);
        if (!Array.isArray(parsed)) {
            throw new Error('Trigger scripts must be a JSON array.');
        }
        return cloneTriggerScripts(parsed);
    }
    return [];
}
function mergePrimaryLuaIntoTriggerScripts(triggerScripts, lua) {
    const scripts = normalizeTriggerScripts(triggerScripts);
    if (typeof lua !== 'string' || !lua) {
        return scripts;
    }
    for (const trigger of scripts) {
        const effects = Array.isArray(trigger?.effect) ? trigger.effect : [];
        for (const effect of effects) {
            if (effect && (effect.type === 'triggerlua' || typeof effect.code === 'string')) {
                effect.type = effect.type || 'triggerlua';
                effect.code = lua;
                return scripts;
            }
        }
    }
    scripts.unshift({
        comment: '',
        type: 'start',
        conditions: [],
        effect: [{ type: 'triggerlua', code: lua }],
        lowLevelAccess: false
    });
    return scripts;
}
function stringifyTriggerScripts(triggerScripts) {
    return JSON.stringify(normalizeTriggerScripts(triggerScripts), null, 2);
}
function openZipEntriesWithPreludeSupport(filePath) {
    try {
        const zip = new AdmZip(filePath);
        return { zip, entries: zip.getEntries() };
    }
    catch (error) {
        const buffer = fs.readFileSync(filePath);
        const zipOffset = buffer.indexOf(ZIP_LOCAL_FILE_HEADER);
        if (zipOffset > 0) {
            try {
                const zip = new AdmZip(buffer.subarray(zipOffset));
                return { zip, entries: zip.getEntries() };
            }
            catch {
                // Fall through to the original error below.
            }
        }
        throw error;
    }
}
// ---------------------------------------------------------------------------
// Open / Save .charx
// ---------------------------------------------------------------------------
/**
 * Open and parse a .charx file
 */
function openCharx(filePath) {
    const { zip, entries } = openZipEntriesWithPreludeSupport(filePath);
    // Parse card.json
    const cardEntry = zip.getEntry('card.json');
    if (!cardEntry)
        throw new Error('card.json not found in .charx');
    const card = JSON.parse(cardEntry.getData().toString('utf-8'));
    // Parse module.risum
    let moduleData = null;
    let risumAssets = [];
    const risumEntry = zip.getEntry('module.risum');
    if (risumEntry) {
        const parsed = parseRisum(risumEntry.getData());
        moduleData = parsed.module;
        risumAssets = parsed.assets;
    }
    // Collect image assets
    const assets = [];
    const xMeta = {};
    for (const entry of entries) {
        if (entry.entryName.startsWith('assets/') && !entry.isDirectory) {
            assets.push({
                path: entry.entryName,
                data: entry.getData()
            });
        }
        if (entry.entryName.startsWith('x_meta/') && entry.entryName.endsWith('.json')) {
            const metaName = path.basename(entry.entryName, '.json');
            xMeta[metaName] = JSON.parse(entry.getData().toString('utf-8'));
        }
    }
    // Extract editable components
    const data = card.data || {};
    const risuExt = data.extensions?.risuai || {};
    const mod = moduleData?.module || {};
    const triggerScripts = cloneTriggerScripts(mod.trigger || []);
    return {
        // Metadata
        spec: card.spec || 'chara_card_v3',
        specVersion: card.spec_version || '3.0',
        // Character info
        name: data.name || '',
        description: data.description || '',
        personality: data.personality || '',
        scenario: data.scenario || '',
        creatorcomment: data.creatorcomment || '',
        tags: data.tags || [],
        // Editable content
        firstMessage: data.first_mes || '',
        alternateGreetings: data.alternate_greetings || [],
        groupOnlyGreetings: data.group_only_greetings || [],
        globalNote: data.post_history_instructions || '',
        css: risuExt.backgroundHTML || '',
        defaultVariables: risuExt.defaultVariables || '',
        lua: extractPrimaryLuaFromTriggerScripts(triggerScripts),
        triggerScripts,
        // Lorebook (use module.risum version as source of truth)
        lorebook: mod.lorebook || [],
        // Regex scripts
        regex: mod.regex || [],
        // Module metadata
        moduleId: mod.id || '',
        moduleName: mod.name || '',
        moduleDescription: mod.description || '',
        // Risum module-specific fields (from embedded module.risum)
        ...extractRisumModuleFields(mod),
        // Assets
        assets,
        xMeta,
        risumAssets,
        // card.json asset references
        cardAssets: data.assets || [],
        // Preserve full risuai extensions for save
        _risuExt: risuExt,
        // Preserve full card for fields we don't edit
        _card: card,
        // Preserve full module for fields we don't edit
        _moduleData: moduleData,
        _presetData: null
    };
}
/**
 * Save data back to .charx file
 */
function saveCharx(filePath, data) {
    const zip = new AdmZip();
    // Build card.json
    const card = JSON.parse(JSON.stringify(data._card || {}));
    if (!card.spec)
        card.spec = 'chara_card_v3';
    if (!card.spec_version)
        card.spec_version = '3.0';
    if (!card.data)
        card.data = {};
    const cardData = card.data;
    cardData.name = data.name;
    cardData.description = data.description;
    cardData.personality = data.personality || '';
    cardData.scenario = data.scenario || '';
    cardData.creatorcomment = data.creatorcomment || '';
    cardData.tags = data.tags || [];
    cardData.first_mes = data.firstMessage;
    cardData.alternate_greetings = data.alternateGreetings || [];
    cardData.group_only_greetings = data.groupOnlyGreetings || [];
    cardData.post_history_instructions = data.globalNote;
    // risuai extensions
    if (!cardData.extensions)
        cardData.extensions = {};
    const extensions = cardData.extensions;
    if (!extensions.risuai)
        extensions.risuai = {};
    const risuExt = extensions.risuai;
    risuExt.backgroundHTML = data.css;
    risuExt.defaultVariables = data.defaultVariables;
    // Remove trigger/script from card (they go in module.risum)
    delete risuExt.customScripts;
    delete risuExt.triggerscript;
    // Lorebook → card.json (CCV3 format)
    if (!cardData.character_book) {
        cardData.character_book = {};
    }
    const characterBook = cardData.character_book;
    characterBook.entries = risuArrayToCCV3(data.lorebook);
    // Preserve card assets
    cardData.assets = data.cardAssets || [];
    zip.addFile('card.json', Buffer.from(JSON.stringify(card, null, 2), 'utf-8'));
    // Build module.risum
    const moduleJson = data._moduleData ? JSON.parse(JSON.stringify(data._moduleData)) : {
        type: 'risuModule',
        module: {
            name: data.moduleName || `${data.name} Module`,
            description: data.moduleDescription || `Module for ${data.name}`,
            id: data.moduleId || generateUUID(),
            trigger: [],
            regex: [],
            lorebook: [],
            assets: []
        }
    };
    const mod = moduleJson.module;
    mod.trigger = mergePrimaryLuaIntoTriggerScripts(data.triggerScripts !== undefined ? data.triggerScripts : mod.trigger, data.lua);
    // Regex
    mod.regex = data.regex || [];
    // Lorebook (risu format)
    mod.lorebook = data.lorebook || [];
    // Apply risum module-specific fields
    applyRisumModuleFields(mod, data);
    const risumBuf = buildRisum(moduleJson, data.risumAssets || []);
    zip.addFile('module.risum', risumBuf);
    // Add image assets
    for (const asset of (data.assets || [])) {
        zip.addFile(asset.path, asset.data);
    }
    // Add x_meta
    for (const [name, meta] of Object.entries(data.xMeta || {})) {
        zip.addFile(`x_meta/${name}.json`, Buffer.from(JSON.stringify(meta), 'utf-8'));
    }
    // Write ZIP
    zip.writeZip(filePath);
}
// ---------------------------------------------------------------------------
// Open / Save .risum
// ---------------------------------------------------------------------------
/**
 * Open and parse a standalone .risum file
 */
function openRisum(filePath) {
    const buf = fs.readFileSync(filePath);
    const parsed = parseRisum(buf);
    const mod = parsed.module?.module
        || parsed.module
        || {};
    return {
        _fileType: 'risum',
        // Module metadata
        name: mod.name || path.basename(filePath, '.risum'),
        description: mod.description || '',
        moduleId: mod.id || '',
        moduleName: mod.name || '',
        moduleDescription: mod.description || '',
        // Risum module-specific fields
        ...extractRisumModuleFields(mod),
        // Editable content
        lua: extractPrimaryLuaFromTriggerScripts(mod.trigger || []),
        triggerScripts: cloneTriggerScripts(mod.trigger || []),
        lorebook: mod.lorebook || [],
        regex: mod.regex || [],
        // charx-only fields (empty for risum)
        firstMessage: '',
        alternateGreetings: [],
        groupOnlyGreetings: [],
        globalNote: '',
        css: '',
        defaultVariables: '',
        personality: '',
        scenario: '',
        creatorcomment: '',
        tags: [],
        // Assets
        assets: [],
        xMeta: {},
        risumAssets: parsed.assets || [],
        cardAssets: [],
        // Preserve original data for save
        _moduleData: parsed.module,
        _risuExt: {},
        _card: { spec: 'chara_card_v3', spec_version: '3.0', data: { extensions: { risuai: {} } } },
        _presetData: null
    };
}
/**
 * Save data back to a standalone .risum file
 */
function saveRisum(filePath, data) {
    const moduleJson = data._moduleData ? JSON.parse(JSON.stringify(data._moduleData)) : {
        type: 'risuModule',
        module: {
            name: data.moduleName || data.name || 'Module',
            description: data.moduleDescription || '',
            id: data.moduleId || generateUUID(),
            trigger: [],
            regex: [],
            lorebook: [],
            assets: []
        }
    };
    const mod = moduleJson.module || moduleJson;
    // Update module name/description
    mod.name = data.moduleName || data.name || mod.name;
    mod.description = data.moduleDescription || data.description || mod.description;
    // Apply risum module-specific fields
    applyRisumModuleFields(mod, data);
    mod.trigger = mergePrimaryLuaIntoTriggerScripts(data.triggerScripts !== undefined ? data.triggerScripts : mod.trigger, data.lua);
    // Regex & Lorebook
    mod.regex = data.regex || [];
    mod.lorebook = data.lorebook || [];
    const risumBuf = buildRisum(moduleJson, data.risumAssets || []);
    fs.writeFileSync(filePath, risumBuf);
}
// ---------------------------------------------------------------------------
// Open / Save .risup (Bot Preset)
// ---------------------------------------------------------------------------
const RISUP_ENCRYPTION_KEY = 'risupreset';
const RISUP_IV = Buffer.alloc(12); // 12 zero bytes
/**
 * Derive AES-256-GCM key from passphrase using SHA-256 (matches RisuAI Web Crypto)
 */
function deriveRisupKey() {
    return crypto.createHash('sha256').update(RISUP_ENCRYPTION_KEY, 'utf8').digest();
}
/**
 * Decrypt AES-GCM encrypted buffer (compatible with Web Crypto API output)
 * Web Crypto appends 16-byte auth tag to ciphertext
 */
function decryptAesGcm(encrypted) {
    const key = deriveRisupKey();
    const tagLength = 16;
    const ciphertext = encrypted.subarray(0, encrypted.length - tagLength);
    const authTag = encrypted.subarray(encrypted.length - tagLength);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, RISUP_IV);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
/**
 * Encrypt buffer with AES-GCM (compatible with Web Crypto API input)
 * Returns ciphertext + 16-byte auth tag appended
 */
function encryptAesGcm(plaintext) {
    const key = deriveRisupKey();
    const cipher = crypto.createCipheriv('aes-256-gcm', key, RISUP_IV);
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([encrypted, authTag]);
}
/** Extract commonly-edited preset fields from a botPreset object into CharxData. */
function extractPresetFields(preset) {
    return {
        name: preset.name || 'Unnamed Preset',
        mainPrompt: preset.mainPrompt || '',
        jailbreak: preset.jailbreak || '',
        globalNote: preset.globalNote || '',
        temperature: typeof preset.temperature === 'number' ? preset.temperature : 80,
        maxContext: typeof preset.maxContext === 'number' ? preset.maxContext : 4000,
        maxResponse: typeof preset.maxResponse === 'number' ? preset.maxResponse : 300,
        frequencyPenalty: typeof preset.frequencyPenalty === 'number' ? preset.frequencyPenalty : 70,
        presencePenalty: typeof preset.PresensePenalty === 'number' ? preset.PresensePenalty : 70,
        aiModel: preset.aiModel || '',
        subModel: preset.subModel || '',
        apiType: preset.apiType || '',
        promptPreprocess: !!preset.promptPreprocess,
        promptTemplate: preset.promptTemplate ? JSON.stringify(preset.promptTemplate) : '[]',
        presetBias: preset.bias ? JSON.stringify(preset.bias) : '[]',
        formatingOrder: preset.formatingOrder ? JSON.stringify(preset.formatingOrder) : '[]',
        regex: Array.isArray(preset.regex) ? preset.regex : [],
        presetImage: preset.image || '',
    };
}
/** Write edited preset fields back into a botPreset object. */
function applyPresetFields(preset, data) {
    preset.name = data.name;
    if (data.mainPrompt !== undefined)
        preset.mainPrompt = data.mainPrompt;
    if (data.jailbreak !== undefined)
        preset.jailbreak = data.jailbreak;
    if (data.globalNote !== undefined)
        preset.globalNote = data.globalNote;
    if (data.temperature !== undefined)
        preset.temperature = data.temperature;
    if (data.maxContext !== undefined)
        preset.maxContext = data.maxContext;
    if (data.maxResponse !== undefined)
        preset.maxResponse = data.maxResponse;
    if (data.frequencyPenalty !== undefined)
        preset.frequencyPenalty = data.frequencyPenalty;
    if (data.presencePenalty !== undefined)
        preset.PresensePenalty = data.presencePenalty;
    if (data.aiModel !== undefined)
        preset.aiModel = data.aiModel;
    if (data.subModel !== undefined)
        preset.subModel = data.subModel;
    if (data.apiType !== undefined)
        preset.apiType = data.apiType;
    if (data.promptPreprocess !== undefined)
        preset.promptPreprocess = data.promptPreprocess;
    if (data.promptTemplate !== undefined) {
        try {
            preset.promptTemplate = JSON.parse(data.promptTemplate);
        }
        catch { /* keep original */ }
    }
    if (data.presetBias !== undefined) {
        try {
            preset.bias = JSON.parse(data.presetBias);
        }
        catch { /* keep original */ }
    }
    if (data.formatingOrder !== undefined) {
        try {
            preset.formatingOrder = JSON.parse(data.formatingOrder);
        }
        catch { /* keep original */ }
    }
    if (data.regex !== undefined)
        preset.regex = data.regex;
    if (data.presetImage !== undefined)
        preset.image = data.presetImage;
}
/**
 * Open and parse a .risup preset file
 * Format: RPack → zlib inflate → msgpack → AES-GCM decrypt → msgpack → botPreset
 */
function openRisup(filePath) {
    const raw = fs.readFileSync(filePath);
    // Step 1: RPack decode (byte substitution)
    const decoded = rpackDecode(raw);
    // Step 2: Zlib decompress (fflate.compressSync produces zlib format)
    const decompressed = zlib.inflateSync(decoded);
    // Step 3: MessagePack decode outer envelope
    const envelope = unpack(decompressed);
    if (!envelope || (envelope.type !== 'preset')) {
        throw new Error('Invalid .risup file: missing type=preset marker');
    }
    // Step 4: AES-GCM decrypt the preset payload
    const encryptedPreset = envelope.preset ?? envelope.pres;
    if (!encryptedPreset) {
        throw new Error('Invalid .risup file: no encrypted preset data');
    }
    const decryptedBuf = decryptAesGcm(Buffer.from(encryptedPreset));
    // Step 5: MessagePack decode the actual preset
    const preset = unpack(decryptedBuf);
    // Clear sensitive keys for safety
    const sanitized = { ...preset };
    delete sanitized.openAIKey;
    delete sanitized.proxyKey;
    return {
        _fileType: 'risup',
        // Extract editable fields
        ...extractPresetFields(sanitized),
        // Fields not applicable to presets (empty defaults)
        description: '',
        firstMessage: '',
        alternateGreetings: [],
        groupOnlyGreetings: [],
        css: '',
        defaultVariables: '',
        lua: '',
        triggerScripts: [],
        lorebook: [],
        // Assets (presets don't have them)
        assets: [],
        xMeta: {},
        risumAssets: [],
        cardAssets: [],
        // Preserved data
        _risuExt: {},
        _card: {},
        _moduleData: null,
        _presetData: sanitized,
    };
}
/**
 * Save data back to a .risup preset file
 * Format: botPreset → msgpack → AES-GCM encrypt → msgpack envelope → zlib deflate → RPack
 */
function saveRisup(filePath, data) {
    // Start from preserved preset data, or create minimal preset
    const preset = data._presetData
        ? JSON.parse(JSON.stringify(data._presetData))
        : {};
    // Apply edited fields
    applyPresetFields(preset, data);
    // Clear sensitive keys (never re-export API keys)
    delete preset.openAIKey;
    delete preset.proxyKey;
    // Step 1: MessagePack encode preset
    const presetBuf = pack(preset);
    // Step 2: AES-GCM encrypt
    const encrypted = encryptAesGcm(presetBuf);
    // Step 3: MessagePack encode envelope
    const envelope = pack({
        presetVersion: 2,
        type: 'preset',
        preset: encrypted,
    });
    // Step 4: Zlib compress
    const compressed = zlib.deflateSync(envelope);
    // Step 5: RPack encode
    const encoded = rpackEncode(compressed);
    fs.writeFileSync(filePath, encoded);
}
// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}
module.exports = {
    openCharx,
    saveCharx,
    openRisum,
    saveRisum,
    openRisup,
    saveRisup,
    extractPrimaryLuaFromTriggerScripts,
    mergePrimaryLuaIntoTriggerScripts,
    normalizeTriggerScripts,
    stringifyTriggerScripts
};

"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanupAgentsMd = cleanupAgentsMd;
exports.initAgentsMdManager = initAgentsMdManager;
const electron_1 = require("electron");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------
let deps;
let activeAgentsFilePath = null;
let activeAgentsOriginalContent = null;
let activeAgentsHadExistingFile = false;
// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------
function cleanupAgentsMd() {
    try {
        if (!activeAgentsFilePath)
            return;
        if (activeAgentsHadExistingFile) {
            fs.writeFileSync(activeAgentsFilePath, activeAgentsOriginalContent, 'utf-8');
        }
        else if (fs.existsSync(activeAgentsFilePath)) {
            fs.unlinkSync(activeAgentsFilePath);
        }
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn('[main] Agents.md cleanup failed:', msg);
    }
    activeAgentsFilePath = null;
    activeAgentsOriginalContent = null;
    activeAgentsHadExistingFile = false;
}
function readProjectGuideContent(cwd, agentsPath) {
    if (activeAgentsFilePath === agentsPath && typeof activeAgentsOriginalContent === 'string') {
        return activeAgentsOriginalContent;
    }
    if (fs.existsSync(agentsPath)) {
        return fs.readFileSync(agentsPath, 'utf-8');
    }
    const claudePath = path.join(cwd, 'CLAUDE.md');
    if (fs.existsSync(claudePath)) {
        return fs.readFileSync(claudePath, 'utf-8');
    }
    const bundledAgentsPath = path.join(deps.getDirname(), 'AGENTS.md');
    if (fs.existsSync(bundledAgentsPath)) {
        return fs.readFileSync(bundledAgentsPath, 'utf-8');
    }
    const bundledClaudePath = path.join(deps.getDirname(), 'CLAUDE.md');
    if (fs.existsSync(bundledClaudePath)) {
        return fs.readFileSync(bundledClaudePath, 'utf-8');
    }
    const guidesClaudePath = path.join(deps.getGuidesDir(), 'CLAUDE.md');
    if (fs.existsSync(guidesClaudePath)) {
        return fs.readFileSync(guidesClaudePath, 'utf-8');
    }
    return '';
}
function buildAgentsDocument(sessionContent, projectGuideContent) {
    const sections = [];
    const trimmedSessionContent = String(sessionContent || '').trim();
    const trimmedProjectGuide = String(projectGuideContent || '').trim();
    if (trimmedSessionContent) {
        sections.push(`# RisuToki Session Context\n\n${trimmedSessionContent}`);
    }
    if (trimmedProjectGuide) {
        sections.push(trimmedProjectGuide);
    }
    return sections.join('\n\n---\n\n');
}
function writeAgentsMd(content) {
    const cwd = deps.getCurrentFilePath() ? path.dirname(deps.getCurrentFilePath()) : process.cwd();
    const agentsPath = path.join(cwd, 'AGENTS.md');
    if (activeAgentsFilePath && activeAgentsFilePath !== agentsPath) {
        cleanupAgentsMd();
    }
    if (activeAgentsFilePath !== agentsPath) {
        activeAgentsHadExistingFile = fs.existsSync(agentsPath);
        activeAgentsOriginalContent = activeAgentsHadExistingFile
            ? fs.readFileSync(agentsPath, 'utf-8')
            : null;
    }
    const projectGuideContent = readProjectGuideContent(cwd, agentsPath);
    const finalContent = buildAgentsDocument(content, projectGuideContent);
    if (!finalContent.trim()) {
        cleanupAgentsMd();
        return null;
    }
    fs.writeFileSync(agentsPath, finalContent, 'utf-8');
    activeAgentsFilePath = agentsPath;
    console.log('[main] AGENTS.md written:', agentsPath);
    return agentsPath;
}
// ---------------------------------------------------------------------------
// Init — register IPC handlers
// ---------------------------------------------------------------------------
function initAgentsMdManager(d) {
    deps = d;
    electron_1.ipcMain.handle('write-agents-md', (_, content) => {
        return writeAgentsMd(content);
    });
    electron_1.ipcMain.handle('write-codex-agents-md', (_, content) => {
        return writeAgentsMd(content);
    });
    electron_1.ipcMain.handle('cleanup-agents-md', () => {
        cleanupAgentsMd();
        return true;
    });
}

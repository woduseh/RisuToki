# Migrating RisuAI Plugins to API v3.0

> Condensed from `Risuai/src/ts/plugins/migrationGuide.md`.

## Why migrate?

| Version | Security model                                    | Status          |
| ------- | ------------------------------------------------- | --------------- |
| `2.0`   | wide global access                                | legacy          |
| `2.1`   | same-document restricted globals                  | transitional    |
| `3.0`   | sandboxed iframe + structured cloning + async API | **recommended** |

API v3.0 is the forward path for new plugin work.

## Breaking changes

| Area            | v2.x                   | v3.0                                     |
| --------------- | ---------------------- | ---------------------------------------- |
| API entry point | global functions       | `risuai.*` namespace                     |
| Sync/async      | mostly sync            | **everything is async**                  |
| DOM             | direct/shared document | iframe `document` or `getRootDocument()` |
| DOM nodes       | native elements        | `SafeElement` wrappers                   |
| UI injection    | manual DOM hacks       | `registerSetting()` / `registerButton()` |
| Isolation       | shared context         | iframe sandbox per plugin                |

## Migration steps

### 1. Update metadata

```javascript
//@name my_plugin
//@api 3.0
```

### 2. Namespace and await API calls

```javascript
// Before
const db = getDatabase();
const char = getChar();

// After
const db = await risuai.getDatabase();
const char = await risuai.getCharacter();
```

### 3. Move custom UI into the iframe

```javascript
document.body.innerHTML = '<h1>Plugin UI</h1>';
await risuai.showContainer('fullscreen');
```

Use `getRootDocument()` only when the plugin truly must touch host DOM.

### 4. Replace DOM hacks with official registration

```javascript
await risuai.registerSetting(
  'My Plugin',
  async () => {
    await risuai.showContainer('fullscreen');
  },
  '⚙️',
  'html',
);
```

### 5. Adapt `SafeElement` usage

```javascript
// Before
element.style.color = 'red';
element.setAttribute('data-id', '123');

// After
await element.setStyle('color', 'red');
await element.setAttribute('x-data-id', '123');
```

### 6. Store listener IDs

```javascript
const id = await element.addEventListener('click', handler);
await element.removeEventListener('click', id);
```

## Deprecated name mapping

| Legacy                | Replacement                    |
| --------------------- | ------------------------------ |
| `getChar()`           | `risuai.getCharacter()`        |
| `setChar()`           | `risuai.setCharacter()`        |
| `getArg(key)`         | `risuai.getArgument(key)`      |
| `setArg(key, val)`    | `risuai.setArgument(key, val)` |
| `risuFetch(url, opt)` | `risuai.nativeFetch(url, opt)` |
| `risuai.log(msg)`     | `console.log(msg)`             |

## Cross-version plugins

If you truly need compatibility shims, declare multiple versions:

```javascript
//@api 2.0 2.1 3.0
```

Then branch by available runtime/API version. For new work, prefer pure v3.

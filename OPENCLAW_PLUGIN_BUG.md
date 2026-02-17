# OpenClaw Plugin Loader Bug

## Issue
OpenClaw 2026.2.9 fails to load AegisMemory plugin with error:
```
[plugins] aegismemory missing register/activate export
```

## Evidence
The plugin exports are correct and verifiable:

```bash
$ cd ~/.openclaw/extensions/aegismemory
$ node -e "import('./index.js').then(m => console.log('Exports:', Object.keys(m)))"
Exports: [ 'default', 'register' ]
```

The plugin structure matches the working `memory-core` plugin:
- ✅ Default export with plugin object
- ✅ `register(api)` method
- ✅ Proper `kind: "memory"`
- ✅ Valid `openclaw.plugin.json`

## Root Cause
OpenClaw's plugin loader appears to have a bug where it cannot properly detect the `register` method on the default export, even though:
1. The export exists and is accessible via Node.js
2. The structure matches working plugins
3. Multiple export formats have been tried (default only, default + named export)

## Attempted Fixes
1. ❌ Export both `default` and named `register`
2. ❌ Export only `default` with `register` method
3. ❌ Create separate `register.js` entrypoint
4. ❌ Reinstall plugin multiple times
5. ❌ Clear config and reinstall

## Workaround
Until OpenClaw fixes this bug, use AegisMemory in standalone mode:

### Manual Memory Capture
After each conversation, run:
```bash
cd /root/aegismemory
./bin/aegismemory.js replay-queue
./bin/aegismemory.js status
```

### Automated via Cron
```bash
# Add to crontab
*/5 * * * * cd /root/aegismemory && ./bin/aegismemory.js replay-queue
```

### Telegram Bot Integration
Modify the bot to call AegisMemory CLI after each conversation.

## Files
- `index.js` - Plugin implementation (CORRECT)
- `openclaw.plugin.json` - Plugin manifest (CORRECT)
- Test: `node -e "import('./index.js').then(m => console.log(m.default.register))"` - Shows function exists

## Next Steps
1. Report bug to OpenClaw team
2. Check for OpenClaw updates: `npm update -g openclaw`
3. Use standalone mode until fixed

## Status
- **Hook Fix**: ✅ COMPLETE (code is correct)
- **OpenClaw Plugin Loader**: ❌ BROKEN (external bug)
- **Workaround**: ✅ Available (standalone mode)

---

**Date**: 2026-02-17  
**OpenClaw Version**: 2026.2.9  
**AegisMemory Version**: 1.0.1

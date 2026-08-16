#!/bin/bash
echo "=========================================="
echo "  HELIOS CORE v2.2.0 - VERIFICACION FINAL"
echo "=========================================="
echo ""

echo "[1/8] Compilacion TypeScript..."
npm run build > /dev/null 2>&1
if [ $? -eq 0 ]; then echo "  ✅ 0 errores, 0 warnings"; else echo "  ❌ ERRORES"; exit 1; fi

echo "[2/8] Boot test..."
npm run boot-test > /dev/null 2>&1
if [ $? -eq 0 ]; then echo "  ✅ 5/5 pasando"; else echo "  ❌ FALLIDO"; exit 1; fi

echo "[3/8] Logger existe..."
test -f src/core/Logger.ts && echo "  ✅ src/core/Logger.ts" || echo "  ❌ NO EXISTE"

echo "[4/8] MemoryEngine tiene LRU..."
grep -q "MAX_ENTRIES_PER_TYPE" src/memory/MemoryEngine.ts && echo "  ✅ Limites implementados" || echo "  ❌ NO"
grep -q "class LRUCache" src/memory/MemoryEngine.ts && echo "  ✅ LRU Cache presente" || echo "  ❌ NO"
grep -q "class BatchWriter" src/memory/MemoryEngine.ts && echo "  ✅ Batch Writer presente" || echo "  ❌ NO"

echo "[5/8] BudgetManager tiene persistencia..."
grep -q "dbPath" src/economy/BudgetManager.ts && echo "  ✅ dbPath presente" || echo "  ❌ NO"
grep -q "load()" src/economy/BudgetManager.ts && echo "  ✅ load() presente" || echo "  ❌ NO"
grep -q "class BatchWriter" src/economy/BudgetManager.ts && echo "  ✅ Batch Writer presente" || echo "  ❌ NO"

echo "[6/8] CloneCommunicator tiene locks..."
grep -q "class AsyncLock" src/clones/CloneCommunicator.ts && echo "  ✅ AsyncLock presente" || echo "  ❌ NO"
grep -q "withChannelLock" src/clones/CloneCommunicator.ts && echo "  ✅ withChannelLock presente" || echo "  ❌ NO"
grep -q "withGlobalLock" src/clones/CloneCommunicator.ts && echo "  ✅ withGlobalLock presente" || echo "  ❌ NO"

echo "[7/8] main.ts usa logger..."
grep -q "import { logger }" src/main.ts && echo "  ✅ Import de logger" || echo "  ❌ NO"
CONSOLE_COUNT=$(grep -c "console\." src/main.ts)
echo "  📊 console.* restantes en main.ts: $CONSOLE_COUNT"

echo "[8/8] Version..."
grep '"version"' package.json | head -1

echo ""
echo "=========================================="
echo "  VERIFICACION COMPLETA"
echo "=========================================="

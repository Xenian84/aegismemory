#!/bin/bash

# Test 5 chat turns to verify hook fix
# Expected: 5 new CIDs in state

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         TESTING 5 CHAT TURNS                                 ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Get initial CID count
INITIAL_STATE=$(cat ~/.openclaw/aegismemory/state.json 2>/dev/null || echo '{}')
echo "📊 Initial state:"
echo "$INITIAL_STATE" | jq -r '.agents.tg // {}'
echo ""

# Run 5 test chats
for i in {1..5}; do
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🔄 Test Chat $i/5"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  
  # Run hook test
  node test-hook-fix.js 2>&1 | grep -E "SUCCESS|Message count|Queue Status" || true
  
  # Process queue
  echo ""
  echo "⚙️  Processing queue..."
  ./bin/aegismemory.js replay-queue 2>&1 | tail -3
  
  # Show current CID
  CURRENT_CID=$(cat ~/.openclaw/aegismemory/state.json | jq -r '.agents.tg.lastCid // "none"')
  echo "📝 Current CID: $CURRENT_CID"
  echo ""
  
  sleep 1
done

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         FINAL STATUS                                         ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

./bin/aegismemory.js status

echo ""
echo "✅ Test complete! Check that you have 5+ new CIDs."

#!/bin/bash

# Test script to trigger an agent run and verify hooks

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         TESTING AGENT RUN WITH HOOKS                         ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Check initial state
echo "📊 Initial State:"
./bin/aegismemory.js status | grep "Last CID"
echo ""

# Trigger agent run via OpenClaw CLI
echo "🤖 Triggering agent run..."
echo "test message from hook test" | openclaw chat --agent tg --no-stream 2>&1 | tail -20 &
CHAT_PID=$!

# Wait for response
sleep 10

# Check if hooks were called
echo ""
echo "🔍 Checking for hook activity..."
ps aux | grep openclaw-gateway | grep -v grep | awk '{print $2}' | head -1 | xargs -I {} cat /proc/{}/fd/1 2>/dev/null | grep "🎯" | tail -5 || echo "No hook logs found"

# Check queue
echo ""
echo "📊 Queue Status:"
./bin/aegismemory.js status | grep -A2 "Queue:"

# Check if new CID
echo ""
echo "📝 Final State:"
./bin/aegismemory.js status | grep "Last CID"

echo ""
echo "✅ Test complete!"
echo "If you see a new CID or queue jobs, hooks are working!"

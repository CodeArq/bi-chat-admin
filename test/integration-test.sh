#!/bin/bash
# Integration Test Script for Chat Pilot
#
# This script tests the complete message flow between components.
# Run this after starting the bridge server.
#
# Prerequisites:
#   1. Bridge server running on port 3001
#   2. jq installed for JSON parsing
#   3. curl installed
#
# Usage:
#   ./integration-test.sh

set -e

BRIDGE_URL="${BRIDGE_URL:-http://localhost:3001}"
PASSED=0
FAILED=0

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_pass() {
  echo -e "${GREEN}[PASS]${NC} $1"
  ((PASSED++))
}

log_fail() {
  echo -e "${RED}[FAIL]${NC} $1"
  ((FAILED++))
}

log_info() {
  echo -e "${YELLOW}[INFO]${NC} $1"
}

echo ""
echo "=================================="
echo "  Chat Pilot Integration Tests"
echo "=================================="
echo ""

# Test 1: Health Check
log_info "Test 1: Bridge Health Check"
response=$(curl -s "${BRIDGE_URL}/health")
if echo "$response" | jq -e '.status == "ok"' > /dev/null 2>&1; then
  log_pass "Bridge server is healthy"
else
  log_fail "Bridge server health check failed"
  echo "Response: $response"
fi

# Test 2: Clear Messages
log_info "Test 2: Clear Messages"
response=$(curl -s -X POST "${BRIDGE_URL}/clear")
if echo "$response" | jq -e '.status == "cleared"' > /dev/null 2>&1; then
  log_pass "Messages cleared successfully"
else
  log_fail "Failed to clear messages"
fi

# Test 3: Send User Message
log_info "Test 3: Send User Message"
response=$(curl -s -X POST "${BRIDGE_URL}/message" \
  -H "Content-Type: application/json" \
  -d '{"content": "Hello, this is a test message!"}')
msg_id=$(echo "$response" | jq -r '.id')
if [[ -n "$msg_id" && "$msg_id" != "null" ]]; then
  log_pass "User message sent with ID: $msg_id"
else
  log_fail "Failed to send user message"
  echo "Response: $response"
fi

# Test 4: Verify Message in List
log_info "Test 4: Verify Message Appears in List"
sleep 0.5
response=$(curl -s "${BRIDGE_URL}/messages")
msg_count=$(echo "$response" | jq '.messages | length')
if [[ "$msg_count" -ge 1 ]]; then
  log_pass "Messages list contains $msg_count message(s)"
else
  log_fail "Messages list is empty"
fi

# Test 5: Check Pending Messages
log_info "Test 5: Check Pending Messages"
response=$(curl -s "${BRIDGE_URL}/pending")
pending_count=$(echo "$response" | jq '.messages | length')
if [[ "$pending_count" -ge 1 ]]; then
  log_pass "Found $pending_count pending message(s)"
else
  log_fail "No pending messages found"
fi

# Test 6: Send Response (simulating Claude)
log_info "Test 6: Send Response (Simulating Claude)"
response=$(curl -s -X POST "${BRIDGE_URL}/response" \
  -H "Content-Type: application/json" \
  -d "{\"content\": \"Hello! I received your test message.\", \"in_reply_to\": \"$msg_id\"}")
resp_id=$(echo "$response" | jq -r '.id')
if [[ -n "$resp_id" && "$resp_id" != "null" ]]; then
  log_pass "Response sent with ID: $resp_id"
else
  log_fail "Failed to send response"
fi

# Test 7: Verify Both Messages in List
log_info "Test 7: Verify Conversation Has Both Messages"
sleep 0.5
response=$(curl -s "${BRIDGE_URL}/messages")
msg_count=$(echo "$response" | jq '.messages | length')
if [[ "$msg_count" -ge 2 ]]; then
  log_pass "Conversation has $msg_count messages"
else
  log_fail "Expected at least 2 messages, got $msg_count"
fi

# Test 8: Message Ordering
log_info "Test 8: Verify Message Ordering"
first_type=$(echo "$response" | jq -r '.messages[0].type')
second_type=$(echo "$response" | jq -r '.messages[1].type')
if [[ "$first_type" == "user" && "$second_type" == "assistant" ]]; then
  log_pass "Messages are in correct order (user -> assistant)"
else
  log_fail "Message ordering incorrect: $first_type -> $second_type"
fi

# Test 9: Mark as Delivered
log_info "Test 9: Mark Message as Delivered"
response=$(curl -s -X POST "${BRIDGE_URL}/delivered" \
  -H "Content-Type: application/json" \
  -d "{\"message_id\": \"$msg_id\"}")
if echo "$response" | jq -e '.status == "marked"' > /dev/null 2>&1; then
  log_pass "Message marked as delivered"
else
  log_fail "Failed to mark as delivered"
fi

# Test 10: Pending Should Be Empty After Delivery
log_info "Test 10: Pending Messages Empty After Delivery"
response=$(curl -s "${BRIDGE_URL}/pending")
pending_count=$(echo "$response" | jq '.messages | length')
if [[ "$pending_count" -eq 0 ]]; then
  log_pass "No pending messages (all delivered)"
else
  log_fail "Still have $pending_count pending messages"
fi

# Test 11: Multiple Messages Stress Test
log_info "Test 11: Multiple Messages Test"
curl -s -X POST "${BRIDGE_URL}/clear" > /dev/null
for i in {1..5}; do
  curl -s -X POST "${BRIDGE_URL}/message" \
    -H "Content-Type: application/json" \
    -d "{\"content\": \"Message $i\"}" > /dev/null
done
sleep 0.5
response=$(curl -s "${BRIDGE_URL}/messages")
msg_count=$(echo "$response" | jq '.messages | length')
if [[ "$msg_count" -eq 5 ]]; then
  log_pass "All 5 messages stored correctly"
else
  log_fail "Expected 5 messages, got $msg_count"
fi

# Test 12: Get State
log_info "Test 12: Conversation State"
response=$(curl -s "${BRIDGE_URL}/state")
conv_id=$(echo "$response" | jq -r '.conversation_id')
if [[ -n "$conv_id" && "$conv_id" != "null" ]]; then
  log_pass "Conversation state accessible: $conv_id"
else
  log_fail "Failed to get conversation state"
fi

# Summary
echo ""
echo "=================================="
echo "          Test Summary"
echo "=================================="
echo -e "${GREEN}Passed:${NC} $PASSED"
echo -e "${RED}Failed:${NC} $FAILED"
echo ""

if [[ $FAILED -eq 0 ]]; then
  echo -e "${GREEN}All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}Some tests failed.${NC}"
  exit 1
fi

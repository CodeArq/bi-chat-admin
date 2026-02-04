#!/bin/bash
# Check for pending messages from the chat bridge
#
# Usage:
#   ./check-pending.sh           # Check for messages
#   ./check-pending.sh --json    # Get raw JSON response
#
# Returns the pending messages from the bridge server.
# Can be used to poll for new user messages from the web UI.

BRIDGE_URL="${BRIDGE_URL:-http://localhost:3001}"

if [[ "$1" == "--json" ]]; then
  curl -s "${BRIDGE_URL}/pending"
else
  # Pretty print with message content
  response=$(curl -s "${BRIDGE_URL}/pending")
  count=$(echo "$response" | jq -r '.messages | length')

  if [[ "$count" == "0" ]]; then
    echo "No pending messages"
  else
    echo "Pending messages ($count):"
    echo "$response" | jq -r '.messages[] | "[\(.id)] \(.content)"'
  fi
fi

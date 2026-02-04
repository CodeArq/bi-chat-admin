#!/bin/bash
# Send a response to the chat bridge
#
# Usage:
#   ./send-response.sh "Hello from Claude!"
#   echo "Response text" | ./send-response.sh
#   ./send-response.sh "Response" --in-reply-to "msg-123"
#
# Posts a response to the bridge server, making it visible in the web UI.

BRIDGE_URL="${BRIDGE_URL:-http://localhost:3001}"

# Parse arguments
CONTENT=""
IN_REPLY_TO=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --in-reply-to)
      IN_REPLY_TO="$2"
      shift 2
      ;;
    *)
      CONTENT="$1"
      shift
      ;;
  esac
done

# If no content argument, read from stdin
if [[ -z "$CONTENT" ]]; then
  CONTENT=$(cat)
fi

if [[ -z "$CONTENT" ]]; then
  echo "Error: No content provided"
  echo "Usage: ./send-response.sh \"message\" [--in-reply-to msg-id]"
  exit 1
fi

# Build JSON payload
if [[ -n "$IN_REPLY_TO" ]]; then
  PAYLOAD=$(jq -n --arg content "$CONTENT" --arg reply "$IN_REPLY_TO" \
    '{content: $content, in_reply_to: $reply}')
else
  PAYLOAD=$(jq -n --arg content "$CONTENT" '{content: $content}')
fi

# Send to bridge
response=$(curl -s -X POST "${BRIDGE_URL}/response" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

echo "$response" | jq -r '.id // .error'

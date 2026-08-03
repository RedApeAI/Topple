#!/bin/bash

echo "=========================================="
echo "🧪 WebSocket Real-Time Test"
echo "=========================================="
echo ""

ORG_ID="1f67d342-dd58-43c2-a8ec-4ce8a21970ea"
MSG_ID="msg-$(date +%s)"
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

echo "Sending test webhook..."
echo "  Organization: $ORG_ID"
echo "  Message ID: $MSG_ID"
echo "  Timestamp: $TIMESTAMP"
echo ""

curl -X POST http://localhost:4000/api/webhooks/zernio \
  -H "Content-Type: application/json" \
  -d '{
    "event": "message.received",
    "data": {
      "organizationId": "'$ORG_ID'",
      "id": "'$MSG_ID'",
      "conversationId": "conv-test",
      "accountId": "acc-test",
      "channel": "whatsapp",
      "sender": {"name": "John Doe", "id": "+15555555555"},
      "content": "Test message at '$(date +%H:%M:%S)'",
      "timestamp": "'$TIMESTAMP'"
    }
  }'

echo ""
echo ""
echo "✅ Webhook sent!"
echo ""
echo "📱 Check your frontend at: http://localhost:3001"
echo "   - Open 'One Inbox'"
echo "   - Watch for the green WebSocket indicator"
echo "   - Message should appear instantly!"
echo ""
echo "📋 Server logs:"
tail -5 /tmp/api.log

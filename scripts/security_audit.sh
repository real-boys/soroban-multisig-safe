#!/bin/bash
set -e

echo "Starting Soroban Security Audit..."

# 1. Dependency Vulnerability Check
echo "Running cargo audit..."
cargo audit --quiet

# 2. Custom Pattern Scanning (Slither-like)
echo "Checking for common contract patterns..."

# Check for missing require_auth in functions that appear to be state-changing
# This is a heuristic but useful for basic security hygiene.
STATE_CHANGING_FNS=$(grep -E "pub fn [a-z0-9_]+" contracts/soroban/src/*.rs | grep -v "test" || true)
while read -r line; do
  FN_NAME=$(echo "$line" | awk '{print $3}' | cut -d'(' -f1)
  # Heuristic: functions like 'add_owner', 'remove_owner', 'update_threshold' MUST have require_auth
  if [[ "$FN_NAME" == *"add"* || "$FN_NAME" == *"remove"* || "$FN_NAME" == *"update"* || "$FN_NAME" == *"execute"* ]]; then
    # Get the function body (next few lines) and check for require_auth
    FILE=$(echo "$line" | cut -d':' -f1)
    LINE_NUM=$(echo "$line" | cut -d':' -f2)
    # Check if require_auth is within next 20 lines
    if ! sed -n "${LINE_NUM},$(($LINE_NUM + 20))p" "$FILE" | grep -q "require_auth"; then
      echo "WARNING: Sensitive function '$FN_NAME' at $FILE:$LINE_NUM might be missing require_auth!"
      # We could fail here if we're confident: exit 1
    fi
  fi
done <<< "$STATE_CHANGING_FNS"

# 3. Check for arithmetic overflows (Soroban uses checked math by default but good to verify)
if grep -q " + " contracts/soroban/src/*.rs; then
  echo "ADVISORY: Use checked arithmetic instead of direct + operators where possible."
fi

# 4. Check for unwrap() in production code
UNWRAPS=$(grep -n ".unwrap()" contracts/soroban/src/*.rs | grep -v "test" || true)
if [ ! -z "$UNWRAPS" ]; then
  echo "ADVISORY: Found explicit .unwrap() calls. Consider using 'panic_with_error!' for better error handling:"
  echo "$UNWRAPS"
fi

echo "Security audit complete."

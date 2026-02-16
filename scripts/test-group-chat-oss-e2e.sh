#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8787}"
TOKEN="${EDUCHAT_TOKEN:-}"
ROOM_ID="${ROOM_ID:-}"
LOGIN_USERNAME="${EDUCHAT_E2E_USERNAME:-admin}"
LOGIN_PASSWORD="${EDUCHAT_E2E_PASSWORD:-Albert296600}"

usage() {
  cat <<'EOF'
Usage:
  scripts/test-group-chat-oss-e2e.sh [--base-url URL] [--token TOKEN] [--room-id ROOM_ID]
  scripts/test-group-chat-oss-e2e.sh [--base-url URL] --username USERNAME --password PASSWORD [--room-id ROOM_ID]

Options:
  --base-url URL     API base URL (default: http://localhost:8787)
  --token TOKEN      Chat bearer token (or use env EDUCHAT_TOKEN)
  --username NAME    Login username (default: admin)
  --password PASS    Login password (default: built-in in script)
  --room-id ID       Use existing room ID (or use env ROOM_ID)
  -h, --help         Show this help

Examples:
  scripts/test-group-chat-oss-e2e.sh --token 'eyJ...'
  scripts/test-group-chat-oss-e2e.sh --username alice --password 'secret'
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url)
      BASE_URL="$2"
      shift 2
      ;;
    --token)
      TOKEN="$2"
      shift 2
      ;;
    --room-id)
      ROOM_ID="$2"
      shift 2
      ;;
    --username)
      LOGIN_USERNAME="$2"
      shift 2
      ;;
    --password)
      LOGIN_PASSWORD="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
}

require_cmd curl
require_cmd jq
require_cmd cmp

trim_trailing_slash() {
  local value="$1"
  while [[ "$value" == */ ]]; do
    value="${value%/}"
  done
  echo "$value"
}

BASE_URL="$(trim_trailing_slash "$BASE_URL")"

TMP_DIR="$(mktemp -d /tmp/educhat-oss-e2e.XXXXXX)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

API_BODY_FILE="$TMP_DIR/api-body.json"

api_request() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local content_type="${4:-application/json}"

  local url="${BASE_URL}${path}"
  local -a args=(
    -sS
    -X "$method"
    "$url"
    -H "Authorization: Bearer ${TOKEN}"
  )
  if [[ -n "$body" ]]; then
    args+=(-H "Content-Type: ${content_type}" --data "$body")
  fi

  local status
  status="$(curl "${args[@]}" -o "$API_BODY_FILE" -w "%{http_code}")"
  if [[ "$status" -lt 200 || "$status" -ge 300 ]]; then
    local body_text
    body_text=""
    if [[ -f "$API_BODY_FILE" ]]; then
      body_text="$(cat "$API_BODY_FILE")"
    fi
    local err
    if [[ -f "$API_BODY_FILE" ]]; then
      err="$(jq -r '.error // .message // empty' <"$API_BODY_FILE" 2>/dev/null || true)"
    else
      err=""
    fi
    if [[ -n "$err" ]]; then
      echo "API ${method} ${path} failed (${status}): ${err}" >&2
    elif [[ "$status" == "000" ]]; then
      echo "API ${method} ${path} failed (${status}): unable to connect to ${url}" >&2
    else
      echo "API ${method} ${path} failed (${status}): ${body_text}" >&2
    fi
    exit 1
  fi
  cat "$API_BODY_FILE"
}

login_if_needed() {
  if [[ -n "$TOKEN" ]]; then
    return
  fi
  if [[ -z "$LOGIN_USERNAME" || -z "$LOGIN_PASSWORD" ]]; then
    echo "Provide --token or --username/--password." >&2
    exit 1
  fi

  local payload
  payload="$(jq -cn --arg username "$LOGIN_USERNAME" --arg password "$LOGIN_PASSWORD" \
    '{username: $username, password: $password}')"
  local login_json
  login_json="$(api_request POST "/api/auth/login" "$payload")"
  TOKEN="$(echo "$login_json" | jq -r '.token // empty')"
  if [[ -z "$TOKEN" ]]; then
    echo "Login succeeded but token is empty." >&2
    exit 1
  fi
}

ensure_room() {
  if [[ -n "$ROOM_ID" ]]; then
    return
  fi

  local bootstrap_json
  bootstrap_json="$(api_request GET "/api/group-chat/bootstrap")"
  ROOM_ID="$(echo "$bootstrap_json" | jq -r '.rooms[0].id // empty')"
  if [[ -n "$ROOM_ID" ]]; then
    return
  fi

  local room_name
  room_name="OSS-E2E-$(date +%s)"
  local payload
  payload="$(jq -cn --arg name "$room_name" '{name: $name}')"
  local create_json
  create_json="$(api_request POST "/api/group-chat/rooms" "$payload")"
  ROOM_ID="$(echo "$create_json" | jq -r '.room.id // empty')"
  if [[ -z "$ROOM_ID" ]]; then
    echo "Failed to resolve room ID from create-room response." >&2
    exit 1
  fi
}

download_via_url() {
  local url="$1"
  local output_file="$2"
  local status
  status="$(curl -sS -L "$url" -o "$output_file" -w "%{http_code}")"
  if [[ "$status" -lt 200 || "$status" -ge 300 ]]; then
    echo "Direct download failed (${status}) from: $url" >&2
    exit 1
  fi
}

verify_deleted() {
  local room_id="$1"
  local file_id="$2"
  local download_url="$3"
  local ok_api=0
  local ok_url=0

  for _ in 1 2 3 4 5; do
    local status_api
    status_api="$(curl -sS \
      -H "Authorization: Bearer ${TOKEN}" \
      -o "$API_BODY_FILE" \
      -w "%{http_code}" \
      "${BASE_URL}/api/group-chat/rooms/${room_id}/files/${file_id}/download")"
    if [[ "$status_api" -eq 404 || "$status_api" -eq 410 ]]; then
      ok_api=1
    fi

    local status_url
    status_url="$(curl -sS -L -o /dev/null -w "%{http_code}" "$download_url")"
    if [[ "$status_url" -ge 400 ]]; then
      ok_url=1
    fi

    if [[ "$ok_api" -eq 1 && "$ok_url" -eq 1 ]]; then
      return 0
    fi
    sleep 1
  done

  echo "Delete verification failed: api_removed=${ok_api}, url_unavailable=${ok_url}" >&2
  exit 1
}

main() {
  login_if_needed
  ensure_room

  local source_file="$TMP_DIR/source.txt"
  local downloaded_file="$TMP_DIR/downloaded.txt"
  local marker
  marker="oss-e2e-$(date +%s)-$RANDOM"
  printf 'EduChat OSS E2E\nmarker=%s\n' "$marker" > "$source_file"

  echo "Using room: $ROOM_ID"
  echo "Uploading test file..."
  local upload_file_name
  upload_file_name="oss-e2e-${marker}.txt"
  local upload_json_file="$TMP_DIR/upload.json"
  local upload_status
  upload_status="$(
    curl -sS -X POST \
      "${BASE_URL}/api/group-chat/rooms/${ROOM_ID}/messages/file" \
      -H "Authorization: Bearer ${TOKEN}" \
      -F "file=@${source_file};type=text/plain" \
      -F "fileName=${upload_file_name}" \
      -o "$upload_json_file" \
      -w "%{http_code}"
  )"
  if [[ "$upload_status" -lt 200 || "$upload_status" -ge 300 ]]; then
    local upload_err
    upload_err="$(jq -r '.error // .message // empty' <"$upload_json_file" 2>/dev/null || true)"
    echo "Upload failed (${upload_status}): ${upload_err:-$(cat "$upload_json_file")}" >&2
    exit 1
  fi

  local file_id message_id
  file_id="$(jq -r '.message.file.fileId // empty' <"$upload_json_file")"
  message_id="$(jq -r '.message.id // empty' <"$upload_json_file")"
  if [[ -z "$file_id" || -z "$message_id" ]]; then
    echo "Upload response missing fileId/messageId: $(cat "$upload_json_file")" >&2
    exit 1
  fi
  echo "Uploaded fileId: $file_id"

  echo "Requesting download URL..."
  local dl_json
  dl_json="$(api_request GET "/api/group-chat/rooms/${ROOM_ID}/files/${file_id}/download")"
  local download_url
  download_url="$(echo "$dl_json" | jq -r '.downloadUrl // empty')"
  if [[ -z "$download_url" ]]; then
    echo "Download URL missing in response: $dl_json" >&2
    exit 1
  fi

  echo "Downloading file..."
  download_via_url "$download_url" "$downloaded_file"
  cmp "$source_file" "$downloaded_file"
  echo "Read check: OK"

  echo "Deleting file message..."
  api_request DELETE "/api/group-chat/rooms/${ROOM_ID}/messages/${message_id}/file" >/dev/null

  echo "Verifying delete..."
  verify_deleted "$ROOM_ID" "$file_id" "$download_url"

  echo "OSS E2E PASSED"
  echo "roomId=${ROOM_ID}"
  echo "fileId=${file_id}"
  echo "messageId=${message_id}"
}

main "$@"

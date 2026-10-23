#!/bin/sh
# Run a SQL file against the shared Supabase project through the Management API (token from the Supabase CLI login).
set -e
REF=fifddxxfgrdexedhuyao
T=$(security find-generic-password -s "Supabase CLI" -w); case "$T" in go-keyring-base64:*) T=$(echo "${T#go-keyring-base64:}" | base64 -d);; esac
python3 -c 'import json,sys; print(json.dumps({"query": open(sys.argv[1]).read()}))' "$1" | curl -s -X POST "https://api.supabase.com/v1/projects/$REF/database/query" -H "Authorization: Bearer $T" -H "Content-Type: application/json" --data-binary @-
echo

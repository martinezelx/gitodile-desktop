#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 5 ]]; then
  echo "usage: sign-notarize-macos.sh <unsigned-app.zip> <output-dir> <version> <target> <identity-output>" >&2
  exit 2
fi

for name in GITODILE_MACOS_CERTIFICATE_BASE64 GITODILE_MACOS_CERTIFICATE_PASSWORD GITODILE_APPLE_SIGNING_IDENTITY GITODILE_APPLE_ID GITODILE_APPLE_PASSWORD GITODILE_APPLE_TEAM_ID; do
  if [[ -z "${!name:-}" ]]; then
    echo "Required macOS signing credential is unavailable: ${name}" >&2
    exit 1
  fi
done

unsigned_zip="$1"
output_dir="$2"
version="$3"
target="$4"
identity_output="$5"
work_dir="$(mktemp -d)"
keychain="$work_dir/signing.keychain-db"
certificate="$work_dir/signing.p12"

cleanup() {
  security delete-keychain "$keychain" >/dev/null 2>&1 || true
  rm -rf "$work_dir"
}
trap cleanup EXIT

printf '%s' "$GITODILE_MACOS_CERTIFICATE_BASE64" | base64 -D > "$certificate"
keychain_password="$(uuidgen)"
security create-keychain -p "$keychain_password" "$keychain"
security set-keychain-settings -lut 21600 "$keychain"
security unlock-keychain -p "$keychain_password" "$keychain"
security import "$certificate" -k "$keychain" -P "$GITODILE_MACOS_CERTIFICATE_PASSWORD" -T /usr/bin/codesign -T /usr/bin/security
security set-key-partition-list -S apple-tool:,apple: -s -k "$keychain_password" "$keychain" >/dev/null
security list-keychains -d user -s "$keychain"

ditto -x -k "$unsigned_zip" "$work_dir/app"
apps=()
while IFS= read -r -d '' item; do apps+=("$item"); done < <(find "$work_dir/app" -maxdepth 1 -name '*.app' -type d -print0)
[[ ${#apps[@]} -eq 1 ]]
app="${apps[0]}"

while IFS= read -r -d '' nested; do
  codesign --force --options runtime --timestamp --sign "$GITODILE_APPLE_SIGNING_IDENTITY" "$nested"
done < <(find "$app/Contents" -depth \( -name '*.dylib' -o -name '*.framework' -o -name '*.app' -o -name '*.xpc' \) -print0)
codesign --force --options runtime --timestamp --sign "$GITODILE_APPLE_SIGNING_IDENTITY" "$app"
codesign --verify --deep --strict --verbose=2 "$app"

ditto -c -k --keepParent "$app" "$work_dir/notary-app.zip"
xcrun notarytool submit "$work_dir/notary-app.zip" --apple-id "$GITODILE_APPLE_ID" --password "$GITODILE_APPLE_PASSWORD" --team-id "$GITODILE_APPLE_TEAM_ID" --wait --output-format json > "$work_dir/app-notary.json"
node -e "const r=require(process.argv[1]); if(r.status!=='Accepted') process.exit(1)" "$work_dir/app-notary.json"
xcrun stapler staple "$app"
xcrun stapler validate "$app"
spctl --assess --type execute --verbose=2 "$app"

mkdir -p "$output_dir"
app_name="GitOdile_${version}_${target}"
COPYFILE_DISABLE=1 tar -C "$(dirname "$app")" -czf "$output_dir/${app_name}.app.tar.gz" "$(basename "$app")"
hdiutil create -volname GitOdile -srcfolder "$app" -ov -format UDZO "$output_dir/${app_name}.dmg"
codesign --force --timestamp --sign "$GITODILE_APPLE_SIGNING_IDENTITY" "$output_dir/${app_name}.dmg"
xcrun notarytool submit "$output_dir/${app_name}.dmg" --apple-id "$GITODILE_APPLE_ID" --password "$GITODILE_APPLE_PASSWORD" --team-id "$GITODILE_APPLE_TEAM_ID" --wait --output-format json > "$work_dir/dmg-notary.json"
node -e "const r=require(process.argv[1]); if(r.status!=='Accepted') process.exit(1)" "$work_dir/dmg-notary.json"
xcrun stapler staple "$output_dir/${app_name}.dmg"
xcrun stapler validate "$output_dir/${app_name}.dmg"
spctl --assess --type open --context context:primary-signature --verbose=2 "$output_dir/${app_name}.dmg"

authority="$(codesign -dvv "$app" 2>&1 | sed -n 's/^Authority=//p' | head -n 1)"
team="$(codesign -dvv "$app" 2>&1 | sed -n 's/^TeamIdentifier=//p' | head -n 1)"
app_submission="$(node -e "process.stdout.write(require(process.argv[1]).id)" "$work_dir/app-notary.json")"
dmg_submission="$(node -e "process.stdout.write(require(process.argv[1]).id)" "$work_dir/dmg-notary.json")"
node -e "const fs=require('fs'); fs.writeFileSync(process.argv[1], JSON.stringify({operatingSystem:{result:'passed',authority:process.argv[2],teamIdentifier:process.argv[3]},notarization:{result:'passed',appSubmissionId:process.argv[4],dmgSubmissionId:process.argv[5]}},null,2)+'\n',{flag:'wx'})" "$identity_output" "$authority" "$team" "$app_submission" "$dmg_submission"

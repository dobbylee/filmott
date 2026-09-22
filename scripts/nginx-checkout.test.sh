#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_root="$(mktemp -d "${TMPDIR:-/tmp}/filmott-nginx-checkout.XXXXXX")"
trap 'rm -rf "$test_root"' EXIT
export FILMOTT_REPO_ROOT="$test_root"
source "$repo_root/scripts/deploy-blue-green.sh"
mkdir "$test_root/nginx"
git -C "$test_root" init -q
git -C "$test_root" config user.name fixture
git -C "$test_root" config user.email fixture@example.invalid
for file in nginx.conf security-headers.conf; do
  printf 'old-%s\n' "$file" > "$test_root/nginx/$file"
done
git -C "$test_root" add nginx
git -C "$test_root" -c commit.gpgsign=false commit -qm old
old_sha="$(git -C "$test_root" rev-parse HEAD)"
for file in nginx.conf security-headers.conf; do
  printf 'new-%s\n' "$file" > "$test_root/nginx/$file"
done
git -C "$test_root" add nginx
git -C "$test_root" -c commit.gpgsign=false commit -qm new
new_sha="$(git -C "$test_root" rev-parse HEAD)"
git -C "$test_root" reset --hard "$old_sha" > /dev/null
for file in nginx.conf security-headers.conf; do
  ln "$test_root/nginx/$file" "$test_root/$file.mounted"
done

for sha in "$new_sha" "$new_sha" "$old_sha"; do
  blue_green_checkout_target "$sha" > /dev/null
  for file in nginx.conf security-headers.conf; do
    [ "$test_root/nginx/$file" -ef "$test_root/$file.mounted" ]
    git -C "$test_root" show "$sha:nginx/$file" > "$test_root/expected"
    cmp -s "$test_root/expected" "$test_root/$file.mounted"
  done
done

# checkout 도중 일부 파일 교체 후 실패하면 원래 bytes와 inode를 복구한다.
(
  git() {
    rm "$test_root/nginx/nginx.conf"
    printf 'partial\n' > "$test_root/nginx/nginx.conf"
    return 1
  }
  if blue_green_checkout_target "$new_sha"; then
    echo '실패한 checkout을 성공 처리했습니다.' >&2; exit 1
  fi
  for file in nginx.conf security-headers.conf; do
    [ "$test_root/nginx/$file" -ef "$test_root/$file.mounted" ]
    [ "$(cat "$test_root/$file.mounted")" = "old-$file" ]
  done
)
printf 'Nginx checkout inode·내용·동일 SHA·실패 복구 검사 통과\n'

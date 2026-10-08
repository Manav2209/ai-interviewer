#!/usr/bin/env bash
set -euo pipefail

[[ $EUID == 0 ]] || { echo "Run bootstrap with sudo." >&2; exit 1; }
if ! command -v docker >/dev/null; then
  . /etc/os-release
  [[ $ID == ubuntu && $(dpkg --print-architecture) == amd64 ]] || {
    echo "This bootstrap supports Ubuntu amd64." >&2; exit 1;
  }
  apt-get update
  apt-get install -y ca-certificates curl
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${UBUNTU_CODENAME:-$VERSION_CODENAME}
Components: stable
Architectures: amd64
Signed-By: /etc/apt/keyrings/docker.asc
EOF
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin
fi
command -v curl >/dev/null || { apt-get update; apt-get install -y curl; }
systemctl enable --now docker
docker info >/dev/null
echo "Docker is ready."

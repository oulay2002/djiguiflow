#!/usr/bin/env bash
# La sauvegarde de n8n, vue du serveur. Elle ecrit UNE archive tar.gz sur sa
# sortie standard, et rien d'autre : tout ce qu'elle a a dire passe par stderr.
#
# CE QU'ON A APPRIS LE 23 NOVEMBRE 2026. Le VPS Hostinger qui portait n8n a ete
# supprime pour impaye le 23 septembre, sans sauvegarde chez l'hebergeur. Les
# workflows etaient dans le depot (export quotidien) ; les IDENTIFIANTS, eux,
# n'etaient nulle part ailleurs que dans la base SQLite du serveur. Deux mois
# plus tard, il a fallu les ressaisir un a un. Ce script existe pour que la
# prochaine perte du serveur coute une heure, pas une journee.
#
# COMMENT IL EST APPELE. Par GitHub Actions, chaque nuit, en SSH, avec une cle
# dediee dont la ligne `authorized_keys` porte `command="/opt/n8n/sauvegarde.sh"`
# et `no-pty,no-port-forwarding,...`. Quiconque detient cette cle ne peut donc
# faire QU'UNE chose sur ce serveur : recevoir cette archive. Voir
# `installer-sauvegarde-n8n.sh` pour la pose.
#
# CE QUI PART, ET CE QUI NE PART PAS.
#   - les identifiants, CHIFFRES, tels que `n8n export:credentials` les rend :
#     illisibles sans la cle de chiffrement de n8n ;
#   - les workflows, tels que `n8n export:workflow` les rend — c'est le format
#     que `n8n import:workflow` reprend en conservant les identifiants internes,
#     ce qui a evite de rebrancher le moindre noeud a la reconstruction ;
#   - une copie COHERENTE de la base SQLite (API de sauvegarde de SQLite, pas
#     un `cp` sur un fichier en cours d'ecriture) : executions, reglages,
#     variables, tout ce que les deux exports ne couvrent pas ;
#   - les fichiers de configuration du serveur, avec LEURS SECRETS RETIRES.
#   - JAMAIS la cle de chiffrement (`/home/node/.n8n/config`, ou
#     `N8N_ENCRYPTION_KEY` dans `.env`). Elle a sa propre copie, hors ligne, sur
#     le poste de l'exploitant. Identifiants chiffres ET cle dans le meme depot
#     reviendraient a stocker les identifiants en clair.
#
# USAGE (sur le serveur) :
#   /opt/n8n/sauvegarde.sh > /tmp/essai.tar.gz && tar -tzf /tmp/essai.tar.gz
set -euo pipefail

CONTENEUR="${N8N_CONTENEUR:-n8n-n8n-1}"
DOSSIER="${N8N_DOSSIER:-/opt/n8n}"

dire() { printf 'sauvegarde-n8n : %s\n' "$*" >&2; }
echouer() { dire "ECHEC — $*"; exit 1; }

T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
mkdir -p "$T/n8n/config"

docker inspect "$CONTENEUR" >/dev/null 2>&1 || echouer "le conteneur $CONTENEUR n'existe pas"

# ── 1. Identifiants chiffres et workflows, par la CLI de n8n ─────────────────
#
# La CLI tourne DANS le conteneur, a cote du serveur : elle voit la meme base.
# Son bavardage (« Successfully exported… ») sort sur stdout ; il est renvoye
# vers stderr pour ne pas souiller l'archive.
exporter() {
  local quoi="$1" cible="$2"
  docker exec "$CONTENEUR" n8n "export:$quoi" --all --output="/tmp/export-$quoi.json" >&2
  docker cp "$CONTENEUR:/tmp/export-$quoi.json" "$cible"
  docker exec "$CONTENEUR" rm -f "/tmp/export-$quoi.json"
}
exporter credentials "$T/n8n/identifiants.chiffres.json"
exporter workflow     "$T/n8n/workflows.json"

# ── 2. La base SQLite, copiee proprement ─────────────────────────────────────
#
# Le chemin n'est pas devine : on demande a Docker ou est monte /home/node/.n8n.
# Un volume nomme, un bind mount, un deplacement futur — la reponse suit.
SOURCE=$(docker inspect "$CONTENEUR" \
  --format '{{range .Mounts}}{{if eq .Destination "/home/node/.n8n"}}{{.Source}}{{end}}{{end}}')
[ -n "$SOURCE" ] || echouer "aucun montage sur /home/node/.n8n dans $CONTENEUR"
[ -f "$SOURCE/database.sqlite" ] || echouer "pas de database.sqlite dans $SOURCE"

# `.backup` via l'API de SQLite : coherent meme pendant une ecriture, et il
# integre le journal WAL — un `cp` du seul fichier perdrait les dernieres
# transactions, sans le dire.
python3 - "$SOURCE/database.sqlite" "$T/n8n/database.sqlite" <<'PY' >&2
import sqlite3, sys
src = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
dst = sqlite3.connect(sys.argv[2])
src.backup(dst)
dst.close(); src.close()
PY

# ── 3. La configuration du serveur, secrets retires ─────────────────────────
for f in docker-compose.yml docker-compose.yaml compose.yml compose.yaml Caddyfile .env; do
  [ -f "$DOSSIER/$f" ] || continue
  # Toute ligne VARIABLE=valeur dont le nom sent le secret perd sa valeur. Le
  # nom reste : a la reconstruction, on sait QUOI ressaisir.
  # `[A-Za-z0-9_]` et pas `[A-Za-z_]` : le premier jet oubliait les chiffres,
  # et « N8N_ENCRYPTION_KEY » — LA variable a ne jamais laisser passer —
  # traversait le masque intacte. Vu a l'essai sur un echantillon, pas en
  # production : c'est a ca que sert d'eprouver un garde avant de le poser.
  sed -E 's/^([[:space:]]*-?[[:space:]]*[A-Za-z0-9_]*(KEY|SECRET|PASSWORD|TOKEN|PASS)[A-Za-z0-9_]*)[=:].*/\1=<retire de la sauvegarde>/' \
    "$DOSSIER/$f" > "$T/n8n/config/$f"
done

docker exec "$CONTENEUR" n8n --version > "$T/n8n/VERSION" 2>/dev/null || echo inconnue > "$T/n8n/VERSION"
date -u '+%Y-%m-%dT%H:%M:%SZ' > "$T/n8n/HORODATAGE"

# ── 4. On refuse d'envoyer une archive creuse ───────────────────────────────
#
# Une sauvegarde vide est pire qu'une sauvegarde absente : on la croit la.
compter() { python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(len(d) if isinstance(d,list) else -1)' "$1"; }
NB_IDENT=$(compter "$T/n8n/identifiants.chiffres.json")
NB_WF=$(compter "$T/n8n/workflows.json")
[ "$NB_IDENT" -ge 1 ]  || echouer "export des identifiants vide ou illisible ($NB_IDENT)"
[ "$NB_WF" -ge 1 ]     || echouer "export des workflows vide ou illisible ($NB_WF)"
head -c 15 "$T/n8n/database.sqlite" | grep -q 'SQLite format 3' || echouer "la copie de la base n'est pas un fichier SQLite"

# Les identifiants chiffres ne contiennent pas la cle : on le VERIFIE plutot
# que de le croire. Si n8n changeait un jour son format d'export pour y glisser
# la cle, l'archive s'arreterait ici au lieu de partir.
if grep -q 'encryptionKey' "$T/n8n/identifiants.chiffres.json"; then
  echouer "l'export des identifiants contient une cle de chiffrement : rien n'est envoye"
fi

dire "$NB_IDENT identifiants, $NB_WF workflows, base $(du -h "$T/n8n/database.sqlite" | cut -f1), n8n $(cat "$T/n8n/VERSION")"

# ── 5. L'archive, et rien d'autre, sur stdout ───────────────────────────────
tar -C "$T" -czf - n8n

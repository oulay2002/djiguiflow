#!/usr/bin/env bash
# Pose la sauvegarde nocturne de n8n sur le serveur. A executer UNE fois, en
# root, sur le VPS. Idempotent : le relancer remplace le script et ne duplique
# pas la cle.
#
# DEPUIS LE POSTE DE L'EXPLOITANT, en une ligne :
#
#   ssh -i ~/.ssh/djiguiflow_vps root@n8n.djiguiflow.com \
#     'curl -fsSL https://raw.githubusercontent.com/oulay2002/djiguiflow/main/scripts/vps/installer-sauvegarde-n8n.sh | bash'
#
# CE QU'IL FAIT, ET POURQUOI AINSI.
#
#   1. Telecharge `sauvegarde-n8n.sh` depuis le depot — la meme source que la
#      ligne ci-dessus — vers /opt/n8n/sauvegarde.sh. Le depot est la reference :
#      une copie modifiee a la main sur le serveur serait perdue avec lui.
#
#   2. Ajoute a `authorized_keys` la cle publique `sauvegarde-n8n.pub` du depot,
#      BRIDEE : `command=` force l'execution du seul script de sauvegarde, quoi
#      que demande le client ; `no-pty`, `no-port-forwarding`, `no-agent-forwarding`,
#      `no-X11-forwarding` ferment le reste. La cle privee vit dans un secret
#      GitHub d'un depot PUBLIC : si elle fuyait, son detenteur n'obtiendrait
#      qu'une archive d'identifiants chiffres sans la cle pour les lire.
#
#   3. Fait une sauvegarde d'essai dans /tmp et en liste le contenu, pour que
#      l'echec, s'il y en a un, se voie ICI et pas a 5 h du matin.
#
# La cle publique est tiree du depot plutot que collee en argument : une cle
# collee a la main se tronque, et une cle tronquee refuse en silence.
set -euo pipefail

DEPOT_BRUT="${DEPOT_BRUT:-https://raw.githubusercontent.com/oulay2002/djiguiflow/main/scripts/vps}"
DOSSIER="${N8N_DOSSIER:-/opt/n8n}"
SCRIPT="$DOSSIER/sauvegarde.sh"
AUTORISEES=/root/.ssh/authorized_keys

[ "$(id -u)" = 0 ] || { echo "a lancer en root" >&2; exit 1; }
[ -d "$DOSSIER" ] || { echo "$DOSSIER n'existe pas : n8n n'est pas installe la ou ce script le croit" >&2; exit 1; }
command -v python3 >/dev/null || { echo "python3 manque (apt install python3)" >&2; exit 1; }

echo "1/3 — le script de sauvegarde"
curl -fsSL "$DEPOT_BRUT/sauvegarde-n8n.sh" -o "$SCRIPT.tmp"
grep -q 'tar -C "\$T" -czf - n8n' "$SCRIPT.tmp" || { echo "le script telecharge n'a pas la forme attendue" >&2; rm -f "$SCRIPT.tmp"; exit 1; }
chmod 700 "$SCRIPT.tmp" && mv "$SCRIPT.tmp" "$SCRIPT"
echo "    $SCRIPT en place"

echo "2/3 — la cle SSH bridee"
CLE=$(curl -fsSL "$DEPOT_BRUT/sauvegarde-n8n.pub" | head -1)
case "$CLE" in ssh-ed25519\ *) ;; *) echo "cle publique illisible : « ${CLE:0:30}… »" >&2; exit 1;; esac
OPTIONS="command=\"$SCRIPT\",no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding"
mkdir -p /root/.ssh && chmod 700 /root/.ssh
touch "$AUTORISEES" && chmod 600 "$AUTORISEES"
# On retire toute version precedente de CETTE cle (meme commentaire) avant de
# la reposer : relancer l'installeur ne doit pas empiler des lignes.
grep -v 'sauvegarde-n8n@github-actions' "$AUTORISEES" > "$AUTORISEES.tmp" || true
printf '%s %s\n' "$OPTIONS" "$CLE" >> "$AUTORISEES.tmp"
mv "$AUTORISEES.tmp" "$AUTORISEES" && chmod 600 "$AUTORISEES"
echo "    $(grep -c 'sauvegarde-n8n@github-actions' "$AUTORISEES") ligne(s) pour la cle de sauvegarde"

echo "3/3 — une sauvegarde d'essai"
ESSAI=$(mktemp /tmp/sauvegarde-n8n-essai.XXXXXX.tar.gz)
"$SCRIPT" > "$ESSAI"
echo "    contenu :"
tar -tzvf "$ESSAI" | awk '{printf "      %8s  %s\n", $3, $6}'
rm -f "$ESSAI"
echo
echo "Pose terminee. Cote GitHub, il reste le secret VPS_SAUVEGARDE_SSH_KEY (la cle privee)."

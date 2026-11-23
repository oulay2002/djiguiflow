#!/usr/bin/env bash
# L'exercice de restauration de n8n. Une sauvegarde qu'on n'a jamais restauree
# n'est qu'une hypothese : ce script la met a l'epreuve, sur le serveur, sans
# toucher au n8n de production.
#
# DEPUIS LE POSTE DE L'EXPLOITANT, en une ligne :
#
#   ssh -i ~/.ssh/djiguiflow_vps root@n8n.djiguiflow.com \
#     'curl -fsSL https://raw.githubusercontent.com/oulay2002/djiguiflow/main/scripts/vps/exercice-restauration-n8n.sh | bash'
#
# CE QU'IL PROUVE. Qu'a partir de l'archive produite par `sauvegarde-n8n.sh`
# et de la cle de chiffrement, un n8n NEUF retrouve :
#   - ses identifiants, DECHIFFRABLES (c'est le point qui n'avait jamais ete
#     verifie, et le seul qui coute deux jours s'il est faux) ;
#   - ses workflows, avec leurs identifiants internes d'origine ;
#   - et, par le second chemin, que la copie de la base SQLite demarre telle
#     quelle sur la meme version de n8n.
#
# CE QU'IL NE PROUVE PAS. Que GitHub a bien garde une copie fidele de cette
# archive : par defaut il en fabrique une fraiche avec le meme script. C'est le
# workflow nocturne qui verifie chaque nuit ce qu'il a recu (planchers, type,
# taille). Pour exercer une archive precise, la passer : ARCHIVE=/chemin.tar.gz.
#
# COMMENT IL SE TIENT A L'ECART DE LA PRODUCTION — trois verrous, pas un :
#   1. `--network none` : le n8n jetable n'a AUCUN reseau. Sans cela, il
#      demarrerait les memes declencheurs Telegram que la production et lui
#      VOLERAIT ses messages : deux instances qui interrogent le meme bot se
#      partagent les mises a jour, chacune n'en voit que la moitie, et rien ne
#      le signale.
#   2. Un volume Docker et des conteneurs a lui, nommes `n8n-exercice-*`,
#      detruits a la sortie quoi qu'il arrive (trap EXIT).
#   3. Aucun port publie. On ne lui parle que par `docker exec`.
#
# LA CLE DE CHIFFREMENT est lue dans le conteneur de production, passee au
# jetable par variable d'environnement, et jamais ecrite ni affichee. Les
# identifiants dechiffres servent a etre COMPTES, dans le conteneur jetable,
# puis disparaissent avec son volume.
set -euo pipefail

CONTENEUR_PROD="${N8N_CONTENEUR:-n8n-n8n-1}"
SCRIPT_SAUVEGARDE="${SCRIPT_SAUVEGARDE:-/opt/n8n/sauvegarde.sh}"
ARCHIVE="${ARCHIVE:-}"
# Version attendue, sans valeur par defaut : on compte ce que l'archive dit
# contenir, on ne devine pas.
PREFIXE="n8n-exercice-$$"

rouge=0
ok()     { printf '  OK     %s\n' "$*"; }
echec()  { printf '  ECHEC  %s\n' "$*"; rouge=1; }
etape()  { printf '\n%s\n' "$*"; }

T=$(mktemp -d /tmp/exercice-n8n.XXXXXX)
nettoyer() {
  docker rm -f "$PREFIXE-import" "$PREFIXE-base" >/dev/null 2>&1 || true
  docker volume rm -f "$PREFIXE-vol-import" "$PREFIXE-vol-base" >/dev/null 2>&1 || true
  rm -rf "$T"
  unset CLE
}
trap nettoyer EXIT

# ── 0. Ce qu'on prend a la production : l'image et la cle, rien d'autre ─────
etape "0. Lecture de la production (sans la modifier)"
docker inspect "$CONTENEUR_PROD" >/dev/null 2>&1 || { echo "le conteneur $CONTENEUR_PROD n'existe pas"; exit 1; }
IMAGE=$(docker inspect --format '{{.Config.Image}}' "$CONTENEUR_PROD")
# Le fichier `config` de n8n est du JSON : {"encryptionKey":"..."}. On le lit
# avec node, present dans l'image, et on ne garde que la valeur.
CLE=$(docker exec "$CONTENEUR_PROD" node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync("/home/node/.n8n/config","utf8")).encryptionKey||"")')
[ -n "$CLE" ] || { echo "cle de chiffrement introuvable dans $CONTENEUR_PROD:/home/node/.n8n/config"; exit 1; }
ok "image $IMAGE, cle de chiffrement lue (${#CLE} caracteres, non affichee)"

# ── 1. L'archive ─────────────────────────────────────────────────────────────
etape "1. L'archive"
if [ -n "$ARCHIVE" ]; then
  [ -f "$ARCHIVE" ] || { echo "ARCHIVE=$ARCHIVE n'existe pas"; exit 1; }
  cp "$ARCHIVE" "$T/n8n.tar.gz"; ok "archive fournie : $ARCHIVE"
else
  [ -x "$SCRIPT_SAUVEGARDE" ] || { echo "$SCRIPT_SAUVEGARDE manque : lancer d'abord installer-sauvegarde-n8n.sh"; exit 1; }
  "$SCRIPT_SAUVEGARDE" > "$T/n8n.tar.gz" 2>"$T/sauvegarde.log"
  ok "archive fraiche : $(tail -1 "$T/sauvegarde.log" | sed 's/^sauvegarde-n8n : //')"
fi
tar -C "$T" -xzf "$T/n8n.tar.gz"
chmod -R a+rX "$T/n8n"
ATTENDU_IDENT=$(python3 -c 'import json,sys; print(len(json.load(open(sys.argv[1]))))' "$T/n8n/identifiants.chiffres.json")
ATTENDU_WF=$(python3 -c 'import json,sys; print(len(json.load(open(sys.argv[1]))))' "$T/n8n/workflows.json")
VERSION_ARCHIVE=$(tr -d '[:space:]' < "$T/n8n/VERSION")
VERSION_IMAGE=$(docker run --rm --network none "$IMAGE" --version 2>/dev/null | tr -d '[:space:]' || true)
ok "l'archive annonce $ATTENDU_IDENT identifiants, $ATTENDU_WF workflows, n8n $VERSION_ARCHIVE"
if [ "$VERSION_ARCHIVE" = "$VERSION_IMAGE" ]; then ok "meme version que l'image ($VERSION_IMAGE)"; else echec "version de l'image ($VERSION_IMAGE) differente de l'archive ($VERSION_ARCHIVE) : restaurer sur la version de l'archive, puis migrer"; fi

# Le compteur, execute DANS le jetable : combien d'identifiants dechiffres, et
# combien ont un contenu non vide. Ne sort que des nombres.
COMPTER_DECHIFFRES='const d=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const pleins=d.filter(c=>c.data&&typeof c.data==="object"&&Object.keys(c.data).length>0).length;console.log(d.length+" "+pleins)'

# ── 2. Premier chemin : les imports de la CLI, celui de la reconstruction ───
etape "2. Chemin A — n8n neuf, import:credentials + import:workflow"
docker volume create "$PREFIXE-vol-import" >/dev/null
# L'image n8n prefixe tout argument de `n8n ` (son docker-entrypoint.sh) :
# `jetable_a import:workflow …` devient `n8n import:workflow …`. Pour une ligne
# de shell, il faut donc contourner l'entrypoint : c'est `jetable_sh`.
jetable_a() {
  docker run --rm --network none \
    -e N8N_ENCRYPTION_KEY="$CLE" -e N8N_DIAGNOSTICS_ENABLED=false -e N8N_VERSION_NOTIFICATIONS_ENABLED=false \
    -v "$PREFIXE-vol-import:/home/node/.n8n" -v "$T/n8n:/sauvegarde:ro" \
    "$IMAGE" "$@"
}
jetable_sh() {
  docker run --rm --network none --entrypoint sh \
    -e N8N_ENCRYPTION_KEY="$CLE" -e N8N_DIAGNOSTICS_ENABLED=false -e N8N_VERSION_NOTIFICATIONS_ENABLED=false \
    -v "$PREFIXE-vol-import:/home/node/.n8n" -v "$T/n8n:/sauvegarde:ro" \
    "$IMAGE" -c "$1"
}
if jetable_a import:credentials --input=/sauvegarde/identifiants.chiffres.json >"$T/a-cred.log" 2>&1; then
  ok "import:credentials — $(grep -oE 'Successfully imported [0-9]+ credentials?' "$T/a-cred.log" || echo 'termine')"
else echec "import:credentials a echoue : $(tail -3 "$T/a-cred.log" | tr '\n' ' ')"; fi
if jetable_a import:workflow --input=/sauvegarde/workflows.json >"$T/a-wf.log" 2>&1; then
  ok "import:workflow — $(grep -oE 'Successfully imported [0-9]+ workflows?' "$T/a-wf.log" || echo 'termine')"
else echec "import:workflow a echoue : $(tail -3 "$T/a-wf.log" | tr '\n' ' ')"; fi

# LE POINT QUI COMPTE : les identifiants importes se dechiffrent-ils avec la
# cle ? `export:credentials --decrypted` echoue ou rend des `data` vides si la
# cle n'est pas la bonne.
if jetable_sh 'n8n export:credentials --all --decrypted --output=/tmp/d.json >/dev/null 2>&1 && node -e '"'"$COMPTER_DECHIFFRES"'"' /tmp/d.json; rm -f /tmp/d.json' >"$T/a-dec.txt" 2>"$T/a-dec.err"; then
  read -r nb pleins < "$T/a-dec.txt"
  if [ "$nb" = "$ATTENDU_IDENT" ] && [ "$pleins" = "$ATTENDU_IDENT" ]; then ok "$pleins/$ATTENDU_IDENT identifiants DECHIFFRES avec un contenu"; else echec "$nb identifiants exportes, $pleins avec contenu, $ATTENDU_IDENT attendus"; fi
else echec "le dechiffrement des identifiants a echoue : $(tail -2 "$T/a-dec.err" | tr '\n' ' ')"; fi
nb_wf_a=$(jetable_sh 'n8n export:workflow --all --output=/tmp/w.json >/dev/null 2>&1 && node -e "console.log(JSON.parse(require(\"fs\").readFileSync(\"/tmp/w.json\",\"utf8\")).length)"' 2>/dev/null || echo 0)
if [ "$nb_wf_a" = "$ATTENDU_WF" ]; then ok "$nb_wf_a/$ATTENDU_WF workflows reexportes"; else echec "$nb_wf_a workflows reexportes, $ATTENDU_WF attendus"; fi
# Les identifiants internes doivent etre CEUX D'ORIGINE : c'est ce qui evite
# de rebrancher les appels entre workflows. On compare les ids, pas les noms.
ids_archive=$(python3 -c 'import json,sys; print("\n".join(sorted(w["id"] for w in json.load(open(sys.argv[1])))))' "$T/n8n/workflows.json")
ids_jetable=$(jetable_sh 'n8n export:workflow --all --output=/tmp/w.json >/dev/null 2>&1 && node -e "console.log(JSON.parse(require(\"fs\").readFileSync(\"/tmp/w.json\",\"utf8\")).map(w=>w.id).sort().join(\"\\n\"))"' 2>/dev/null || true)
if [ -n "$ids_jetable" ] && [ "$ids_archive" = "$ids_jetable" ]; then ok "identifiants internes des workflows conserves a l'identique"; else echec "les identifiants internes des workflows different de l'archive"; fi

# ── 3. Second chemin : la copie de la base, posee telle quelle ──────────────
etape "3. Chemin B — la base SQLite restauree, n8n demarre dessus"
docker volume create "$PREFIXE-vol-base" >/dev/null
# La base va dans le volume, avec le proprietaire du conteneur (node, uid 1000).
docker run --rm --network none --entrypoint sh -v "$PREFIXE-vol-base:/home/node/.n8n" -v "$T/n8n:/sauvegarde:ro" \
  --user root "$IMAGE" -c 'cp /sauvegarde/database.sqlite /home/node/.n8n/database.sqlite && chown 1000:1000 /home/node/.n8n/database.sqlite' >/dev/null 2>&1 \
  && ok "base copiee dans un volume neuf" || echec "copie de la base impossible"

docker run -d --name "$PREFIXE-base" --network none \
  -e N8N_ENCRYPTION_KEY="$CLE" -e N8N_DIAGNOSTICS_ENABLED=false -e N8N_VERSION_NOTIFICATIONS_ENABLED=false \
  -e N8N_RUNNERS_ENABLED=true -e N8N_PORT=5678 \
  -v "$PREFIXE-vol-base:/home/node/.n8n" "$IMAGE" >/dev/null
# `/healthz` repond des que le serveur ecoute ; `/healthz/readiness` attend
# la base. C'est la seconde qu'on veut. On la demande depuis l'interieur :
# aucun port n'est publie.
pret=0
for i in $(seq 1 45); do
  if docker exec "$PREFIXE-base" node -e 'fetch("http://127.0.0.1:5678/healthz/readiness").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))' >/dev/null 2>&1; then pret=1; break; fi
  sleep 2
done
if [ "$pret" = 1 ]; then ok "n8n demarre sur la base restauree ($((i*2)) s), sans reseau"; else echec "n8n n'est pas pret apres 90 s : $(docker logs --tail 5 "$PREFIXE-base" 2>&1 | tr '\n' ' ' | cut -c1-300)"; fi
if docker exec "$PREFIXE-base" sh -c 'n8n export:credentials --all --decrypted --output=/tmp/d.json >/dev/null 2>&1 && node -e '"'"$COMPTER_DECHIFFRES"'"' /tmp/d.json; rm -f /tmp/d.json' >"$T/b-dec.txt" 2>/dev/null; then
  read -r nb pleins < "$T/b-dec.txt"
  if [ "$pleins" = "$ATTENDU_IDENT" ]; then ok "$pleins/$ATTENDU_IDENT identifiants dechiffres depuis la base restauree"; else echec "$nb identifiants, $pleins avec contenu, $ATTENDU_IDENT attendus (base restauree)"; fi
else echec "dechiffrement impossible depuis la base restauree"; fi
docker rm -f "$PREFIXE-base" >/dev/null 2>&1 || true

# ── 4. La production n'a pas bouge ───────────────────────────────────────────
etape "4. La production"
etat=$(docker inspect --format '{{.State.Status}} depuis {{.State.StartedAt}}' "$CONTENEUR_PROD")
ok "$CONTENEUR_PROD : $etat"

echo
if [ "$rouge" = 0 ]; then
  echo "EXERCICE REUSSI — l'archive restaure un n8n complet avec la cle de chiffrement. Date a noter dans docs/REPRISE-N8N.md : $(date -u '+%Y-%m-%d')."
else
  echo "EXERCICE EN ECHEC — au moins une ligne ECHEC ci-dessus. La sauvegarde ne vaut pas encore une restauration."
  exit 1
fi

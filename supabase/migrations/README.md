# Migrations — provenance et limites

## Ce dossier a été reconstitué le 17 août 2026

Jusqu'à cette date, **30 des 38 migrations appliquées n'avaient aucun fichier ici**. Le
schéma de production — politiques RLS, `GRANT` de colonnes, `REVOKE` sur les fonctions
`SECURITY DEFINER` — n'existait qu'en base. Conséquences : le DDL le plus sensible du projet
n'était jamais passé par un commit, donc jamais relu ; un environnement de recette
reconstruit depuis le dépôt aurait été **plus ouvert que la production**, et des tests y
auraient passé qui devaient échouer.

Les 38 fichiers viennent de `supabase_migrations.schema_migrations.statements`, qui conserve
le texte **exact** soumis à la base, commentaires d'intention compris. Ils sont donc fidèles
à ce qui tourne. Vérifié après écriture : 38 fichiers, 38 migrations en base, aucun écart,
aucun orphelin.

Huit fichiers portaient un préfixe à 8 chiffres (`20260805_…`) là où la version réelle en a
14 (`20260805224907`). La CLI les lisait comme des migrations *distinctes et non appliquées* :
un `supabase db push` aurait tenté de les rejouer. Ils ont été remplacés par les fichiers
correctement nommés, après vérification que leur contenu était identique à l'historique.

```sql
-- Pour revérifier à tout moment que le dossier reflète la base :
select version, name from supabase_migrations.schema_migrations order by version;
```

## Limite connue : l'historique n'est pas rejouable depuis zéro

`20260805224907_harden_security_definer_functions.sql` déclare `response public.http_response`
et appelle `public.http_post(...)` — deux objets de l'extension `http`. Or :

- **aucune migration ne crée cette extension** : elle avait été installée à la main ;
- elle a été **supprimée le 17 août** (`20260817125218_retirer_extension_http_non_utilisee`)
  parce que `anon` détenait `EXECUTE` sur ses fonctions, ce qui donnait à tout visiteur un
  relais de requêtes sortantes depuis la base.

`check_function_bodies` valant `on`, PL/pgSQL résout les types déclarés à la création de la
fonction : rejouer l'historique sur une base neuve **échouerait** à cette migration, sur
`type "public.http_response" does not exist`.

Ce n'est pas un problème pour la production, qui est déjà à jour. Ça en est un pour
reconstruire un environnement. **Ne pas corriger en éditant ce fichier d'historique** — le
dossier vaut précisément parce qu'il dit la vérité sur ce qui a été appliqué.

La suite propre est une **migration de référence** : un fichier unique décrivant l'état
courant du schéma (`supabase db pull`, ou `supabase migration squash`), qui devient le point
de départ des environnements neufs, les 38 fichiers restant là pour la lecture et l'audit.
Tâche distincte, à faire quand un environnement de recette sera nécessaire.

## Deux fonctions de cet historique n'existent plus

`notify_n8n_new_livraison` et `notify_n8n_statut_livraison` apparaissent dans les migrations
d'août puis sont retirées par `20260812170106_retirer_declencheurs_livraison_vers_n8n`. Les
workflows n8n qui les recevaient — `Assignation Livreur` et `Statut Livraison` — sont
archivés depuis le 17 août ; `Acceptation Livraison` reprend la notification du client à
chaque étape. Lire ces migrations sans cette précision laisse croire à des déclencheurs
encore actifs.

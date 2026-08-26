-- LES PORTES QUE L'AUDIT DU 26 AOUT A TROUVEES OUVERTES.
--
-- Cinq gestes, tous verifies avant d'etre poses. Aucun ne change ce que le
-- produit fait ; tous retirent ce que personne n'utilise.

-- ── 1. UN ABONNEMENT ECHU N'OUVRE PLUS LE MULTI-BOUTIQUE ──────────────────
--
-- `limiter_boutiques_par_plan` lisait `plan_key` et rien d'autre. Or RIEN ne
-- revoque une ligne de `subscriptions` : `prolonger_acces` la pose, et aucune
-- tache, aucun declencheur ne repasse derriere. Un Premium paye un seul mois
-- ouvrait donc le multi-boutique a vie.
--
-- Meme regle que `accesOuvert` cote application, et pour la meme raison :
-- l'echeance ne doit pas etre une affaire de navigateur.
--
-- UNE DATE ABSENTE OU ILLISIBLE N'EST PAS UNE ECHEANCE PASSEE. Les acces
-- ouverts a la main, avant le prepaye, n'ont pas de `current_period_end` : les
-- fermer ici retirerait un droit a des comptes qui l'ont paye autrement.

create or replace function public.limiter_boutiques_par_plan()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  deja integer;
  ligne record;
begin
  select count(*) into deja from public.boutiques where user_id = new.user_id;

  -- La premiere boutique d'un compte passe toujours. Sans cette ligne, un
  -- nouvel inscrit ne pourrait rien creer du tout.
  if deja = 0 then
    return new;
  end if;

  select plan_key, status, current_period_end into ligne
  from public.subscriptions where user_id = new.user_id limit 1;

  if coalesce(ligne.plan_key, '') = 'premium'
     and coalesce(ligne.status, '') in ('active', 'trialing')
     and (ligne.current_period_end is null or ligne.current_period_end > now())
  then
    return new;
  end if;

  raise exception
    'Plusieurs boutiques sur un meme compte sont reservees au forfait Premium.'
    using errcode = 'check_violation';
end;
$function$;

-- ── 2. UNE FONCTION DE DECLENCHEUR N'EST PAS UNE RPC ──────────────────────
--
-- Supabase accorde EXECUTE a `anon` et `authenticated` sur toute fonction
-- creee dans `public` : `limiter_boutiques_par_plan` etait donc exposee sur
-- `/rest/v1/rpc/`. L'appeler hors declencheur echoue — ce n'est pas une faille
-- ouverte — mais une fonction de declencheur n'a aucune raison d'y figurer.
--
-- CE QUE CE CAS A REVELE COMPTE PLUS QUE LUI. Le garde
-- `scripts/verifier-fonctions-definer.mjs` cherche `REVOKE ... FROM PUBLIC`.
-- Or Supabase n'accorde jamais a PUBLIC : il accorde a `anon` et
-- `authenticated` nommement. Le garde regardait donc le mauvais role, et il est
-- reste vert pendant que cette fonction naissait ouverte. Il est corrige dans
-- le meme commit.

revoke all on function public.limiter_boutiques_par_plan() from anon, authenticated;

-- ── 3. DEUX POLITIQUES PUBLIQUES QUE PLUS RIEN N'UTILISE ──────────────────
--
--     create policy "public_read_boutiques" on boutiques for select to anon using (true);
--     create policy "public_read_produits"  on produits  for select to anon using (true);
--
-- `using (true)` ne filtre AUCUNE ligne. Verifie en direct le 26 aout avec la
-- cle anon — celle qui est dans le bundle JS, donc publique : `/rest/v1/produits`
-- rendait les 14 articles de TOUS les marchands, y compris ceux marques
-- `disponible = false` et ceux de boutiques desactivees. `/rest/v1/boutiques`
-- rendait slug, nom, zone, categorie et TELEPHONE de chaque marchand.
--
-- Les filtres que la vitrine applique — `actif`, exclusion des boutiques
-- d'essai, exclusion des boutiques non branchees — vivent dans les fonctions
-- `vitrine_*`. RLS, lui, ne filtrait rien.
--
-- CES POLITIQUES SONT MORTES. Verifie fichier par fichier : la page d'accueil,
-- l'annuaire et la fiche boutique passent tous par `supabase.rpc('vitrine_*')`.
-- Les seules lectures directes de ces deux tables sont dans le tableau de bord,
-- donc en `authenticated`, et elles relevent d'autres politiques.
--
-- On retire aussi les droits de colonne : une politique supprimee sans le
-- `revoke` laisserait la porte refermee par une seule serrure.

drop policy if exists "public_read_boutiques" on public.boutiques;
drop policy if exists "public_read_produits" on public.produits;

revoke select on public.boutiques from anon;
revoke select on public.produits from anon;

-- ── 4. DEUX POLITIQUES SANS `TO` S'APPLIQUENT AUSSI A `anon` ──────────────
--
-- `paiements_select_own` et `push_subscriptions_select_own` sont ecrites sans
-- clause `TO` : elles valent donc pour PUBLIC, `anon` compris. Elles ne fuient
-- rien — `auth.uid()` vaut NULL pour un visiteur, et `NULL = user_id` n'est
-- jamais vrai — mais une politique dont la sureté depend d'une comparaison a
-- NULL est une politique qu'on relira mal. On la nomme.

drop policy if exists "paiements_select_own" on public.paiements;
create policy "paiements_select_own" on public.paiements
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "push_subscriptions_select_own" on public.push_subscriptions;
create policy "push_subscriptions_select_own" on public.push_subscriptions
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- ── 5. LE FILET QUI ACTIVE RLS SURVIT A UNE RESTAURATION ──────────────────
--
-- `rls_auto_enable()` active RLS sur toute table nouvellement creee. Le
-- declencheur d'evenement qui l'appelle EXISTE en production — verifie le
-- 26 aout, `ensure_rls` est actif — mais `supabase/reference/schema.sql` ne le
-- porte pas : `pg_dump` n'exporte pas les declencheurs d'evenement.
--
-- Or l'en-tete de ce fichier dit : « pour restaurer, rejouer ce fichier PUIS
-- les migrations ». Une base restauree ainsi aurait donc les
-- `alter default privileges ... to anon` SANS le filet qui active RLS derriere.
-- Toute table creee ensuite serait publiquement lisible.
--
-- `create event trigger` n'accepte pas `if not exists` : on regarde d'abord.

do $$
begin
  if not exists (select 1 from pg_event_trigger where evtname = 'ensure_rls') then
    create event trigger ensure_rls
      on ddl_command_end
      when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      execute function public.rls_auto_enable();
  end if;
end
$$;

-- ── 6. LE SEAU D'IMAGES N'ACCEPTE QUE DES IMAGES ──────────────────────────
--
-- `allowed_mime_types` valait NULL : n'importe quel type passait, et le type
-- est celui que le NAVIGATEUR du marchand declare. Un fichier HTML televerse
-- comme logo etait servi tel quel depuis le domaine de stockage.
--
-- La separation d'origine contenait le degat — ce n'est pas le domaine qui
-- porte la session — mais rien ne justifiait de l'accepter. Le seau s'appelle
-- « images ».
--
-- SVG EST VOLONTAIREMENT ABSENT DE LA LISTE. Un SVG est un document XML : il
-- peut porter un `<script>`, qui s'execute des qu'on ouvre le fichier
-- directement. L'admettre reviendrait a rouvrir la porte qu'on ferme ici, avec
-- une extension d'image pour maquillage.
--
-- Le seau n'en contient aucun — verifie le 26 aout : 8 webp, 4 png, 2 jpeg —
-- donc cette exclusion ne retire rien a personne. Le jour ou un marchand
-- voudra un logo vectoriel, il faudra le nettoyer avant de le stocker, pas
-- elargir cette liste.

update storage.buckets
   set allowed_mime_types = array[
         'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'
       ]
 where id = 'images'
   and allowed_mime_types is null;

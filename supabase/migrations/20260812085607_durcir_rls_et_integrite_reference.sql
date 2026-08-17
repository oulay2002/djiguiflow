-- 1. LA REFERENCE EST DEVENUE LA CLE DE SUIVI --------------------------------
--
-- `/api/suivi` cherche desormais une commande par sa seule reference, sans
-- connaitre la boutique. Or l'unicite n'etait garantie que par couple
-- (boutique_id, reference) : deux marchands pouvaient legitimement emettre la
-- meme, et le suivi serait tombe sur `maybeSingle()` avec deux lignes, donc sur
-- un 503 opaque. Le risque n'etait pas theorique : `/api/boutiques/[id]/commander`
-- prefixe encore toutes les references par « APP- », pour tous les marchands.
--
-- L'index est pose sur `upper(reference)` parce que la route compare sans tenir
-- compte de la casse. Verifie avant pose : 26 references, 26 distinctes.
create unique index if not exists commandes_reference_globale_unique
  on public.commandes (upper(reference))
  where reference is not null;

-- 2. CLE ETRANGERE SANS INDEX ------------------------------------------------
create index if not exists idx_livreurs_user_id on public.livreurs (user_id);

-- 3. POLITIQUES RLS : UNE EVALUATION AU LIEU D'UNE PAR LIGNE -----------------
--
-- `auth.uid()` non enveloppe est re-evalue pour chaque ligne examinee. Sur une
-- table de commandes qui grossit, le cout est proportionnel au nombre de
-- lignes plutot que constant. `(select auth.uid())` est evalue une fois.
--
-- Les politiques passent au passage du role `public` au role `authenticated` :
-- elles ne pouvaient de toute facon rien rendre a un visiteur anonyme, pour qui
-- `auth.uid()` est nul, mais Postgres les evaluait quand meme a chaque requete
-- anonyme — d'ou l'avertissement « multiple permissive policies » sur les
-- tables qui portent aussi une lecture publique.

-- boutiques
drop policy if exists "Voir sa propre boutique" on public.boutiques;
create policy "Voir sa propre boutique" on public.boutiques
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Créer sa boutique" on public.boutiques;
create policy "Créer sa boutique" on public.boutiques
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Modifier sa boutique" on public.boutiques;
create policy "Modifier sa boutique" on public.boutiques
  for update to authenticated using ((select auth.uid()) = user_id);

-- produits
drop policy if exists "Voir les produits de sa boutique" on public.produits;
create policy "Voir les produits de sa boutique" on public.produits
  for select to authenticated
  using (boutique_id in (select id from public.boutiques where user_id = (select auth.uid())));

drop policy if exists "Ajouter des produits" on public.produits;
create policy "Ajouter des produits" on public.produits
  for insert to authenticated
  with check (boutique_id in (select id from public.boutiques where user_id = (select auth.uid())));

drop policy if exists "Modifier ses produits" on public.produits;
create policy "Modifier ses produits" on public.produits
  for update to authenticated
  using (boutique_id in (select id from public.boutiques where user_id = (select auth.uid())));

drop policy if exists "Supprimer ses produits" on public.produits;
create policy "Supprimer ses produits" on public.produits
  for delete to authenticated
  using (boutique_id in (select id from public.boutiques where user_id = (select auth.uid())));

-- commandes
drop policy if exists "Voir ses propres commandes" on public.commandes;
create policy "Voir ses propres commandes" on public.commandes
  for select to authenticated
  using (boutique_id in (select id from public.boutiques where user_id = (select auth.uid())));

drop policy if exists "Mettre à jour ses propres commandes" on public.commandes;
create policy "Mettre à jour ses propres commandes" on public.commandes
  for update to authenticated
  using (boutique_id in (select id from public.boutiques where user_id = (select auth.uid())));

-- commande_items
drop policy if exists "Voir les articles de ses commandes" on public.commande_items;
create policy "Voir les articles de ses commandes" on public.commande_items
  for select to authenticated
  using (commande_id in (
    select c.id from public.commandes c
     where c.boutique_id in (select id from public.boutiques where user_id = (select auth.uid()))));

-- livreurs
drop policy if exists "Voir ses livreurs" on public.livreurs;
create policy "Voir ses livreurs" on public.livreurs
  for select to authenticated
  using (boutique_id in (select id from public.boutiques where user_id = (select auth.uid())));

drop policy if exists "Créer ses livreurs" on public.livreurs;
create policy "Créer ses livreurs" on public.livreurs
  for insert to authenticated
  with check (boutique_id in (select id from public.boutiques where user_id = (select auth.uid())));

drop policy if exists "Modifier ses livreurs" on public.livreurs;
create policy "Modifier ses livreurs" on public.livreurs
  for update to authenticated
  using (boutique_id in (select id from public.boutiques where user_id = (select auth.uid())));

drop policy if exists "Supprimer ses livreurs" on public.livreurs;
create policy "Supprimer ses livreurs" on public.livreurs
  for delete to authenticated
  using (boutique_id in (select id from public.boutiques where user_id = (select auth.uid())));

-- livraisons
drop policy if exists "Voir ses livraisons" on public.livraisons;
create policy "Voir ses livraisons" on public.livraisons
  for select to authenticated
  using (commande_id in (
    select c.id from public.commandes c
     where c.boutique_id in (select id from public.boutiques where user_id = (select auth.uid()))));

drop policy if exists "Créer ses livraisons" on public.livraisons;
create policy "Créer ses livraisons" on public.livraisons
  for insert to authenticated
  with check (commande_id in (
    select c.id from public.commandes c
     where c.boutique_id in (select id from public.boutiques where user_id = (select auth.uid()))));

drop policy if exists "Modifier ses livraisons" on public.livraisons;
create policy "Modifier ses livraisons" on public.livraisons
  for update to authenticated
  using (commande_id in (
    select c.id from public.commandes c
     where c.boutique_id in (select id from public.boutiques where user_id = (select auth.uid()))));

-- notification_settings
drop policy if exists "Voir ses paramètres" on public.notification_settings;
create policy "Voir ses paramètres" on public.notification_settings
  for select to authenticated
  using (boutique_id in (select id from public.boutiques where user_id = (select auth.uid())));

drop policy if exists "Créer ses paramètres" on public.notification_settings;
create policy "Créer ses paramètres" on public.notification_settings
  for insert to authenticated
  with check (boutique_id in (select id from public.boutiques where user_id = (select auth.uid())));

drop policy if exists "Modifier ses paramètres" on public.notification_settings;
create policy "Modifier ses paramètres" on public.notification_settings
  for update to authenticated
  using (boutique_id in (select id from public.boutiques where user_id = (select auth.uid())));

-- subscriptions
drop policy if exists "subscriptions_select_own" on public.subscriptions;
create policy "subscriptions_select_own" on public.subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);

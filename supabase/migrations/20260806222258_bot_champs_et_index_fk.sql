-- Etape 1a de la migration Sheets -> Supabase.
-- Additif uniquement : aucune colonne existante n'est modifiee ni supprimee,
-- rien ne change pour l'application ni pour n8n a ce stade.
--
-- Le schema Supabase avait ete concu pour un flux "app" et ignorait les
-- concepts du bot WhatsApp/Telegram : identite de conversation, canal,
-- reference lisible, panier en cours de collecte, etat de livraison.

-- ---------------------------------------------------------------- commandes
alter table public.commandes
  add column if not exists reference text,
  add column if not exists chat_id text,
  add column if not exists canal text,
  add column if not exists instructions text,
  add column if not exists nom_livreur text,
  add column if not exists statut_livraison text,
  add column if not exists position_livreur text,
  add column if not exists heure_prise_en_charge timestamptz,
  add column if not exists heure_livraison timestamptz,
  add column if not exists note_client integer;

comment on column public.commandes.reference is
  'Reference lisible cote client (ZH-..., APP-...). Cle de correspondance avec Google Sheets pendant la periode de double ecriture.';
comment on column public.commandes.chat_id is
  'Identifiant de conversation WhatsApp (225XXXXXXXX) ou Telegram. Sert a retrouver le client entre deux messages.';
comment on column public.commandes.canal is
  'Origine de la commande : whatsapp, telegram ou app.';

-- Le panier en cours de collecte par l'agent n'existait pas dans le
-- vocabulaire de statuts : sans lui, impossible de copier fidelement les
-- lignes "en_cours" de la feuille.
do $$
begin
  if exists (select 1 from pg_constraint
             where conname = 'commandes_statut_check'
               and conrelid = 'public.commandes'::regclass) then
    alter table public.commandes drop constraint commandes_statut_check;
  end if;

  alter table public.commandes add constraint commandes_statut_check
    check (statut = any (array[
      'panier',          -- collecte en cours par l'agent, pas encore une commande
      'en_attente',
      'en_preparation',
      'en_livraison',
      'livree',
      'annulee'
    ]));
end $$;

-- Une reference doit etre unique par boutique, pas globalement : deux
-- marchands peuvent legitimement emettre la meme suite de caracteres.
do $$
begin
  if not exists (select 1 from pg_constraint
                 where conname = 'commandes_boutique_reference_unique'
                   and conrelid = 'public.commandes'::regclass) then
    alter table public.commandes
      add constraint commandes_boutique_reference_unique unique (boutique_id, reference);
  end if;
end $$;

-- ---------------------------------------------------------------- produits
alter table public.produits
  add column if not exists reference text,
  add column if not exists stock_initial integer,
  add column if not exists seuil_alerte integer,
  add column if not exists menu_du_jour boolean not null default false;

comment on column public.produits.reference is
  'Identifiant du produit dans la feuille Menu (colonne id). Sert de cle de correspondance pendant la migration.';
comment on column public.produits.menu_du_jour is
  'Plat mis en avant par l agent dans le menu du jour.';

do $$
begin
  if not exists (select 1 from pg_constraint
                 where conname = 'produits_boutique_reference_unique'
                   and conrelid = 'public.produits'::regclass) then
    alter table public.produits
      add constraint produits_boutique_reference_unique unique (boutique_id, reference);
  end if;
end $$;

-- ------------------------------------------------- index sur cles etrangeres
-- Postgres n'indexe pas automatiquement les FK : sans ces index, chaque
-- jointure et chaque cascade fait un parcours complet de table.
create index if not exists idx_commandes_boutique on public.commandes (boutique_id);
create index if not exists idx_commande_items_commande on public.commande_items (commande_id);
create index if not exists idx_commande_items_produit on public.commande_items (produit_id);
create index if not exists idx_produits_boutique on public.produits (boutique_id);

-- ------------------------------------------------ index d acces applicatifs
-- Le dashboard trie les commandes par date decroissante, le bot retrouve un
-- client par son chat_id, le suivi client cherche par reference.
create index if not exists idx_commandes_boutique_created
  on public.commandes (boutique_id, created_at desc);
create index if not exists idx_commandes_chat_id
  on public.commandes (chat_id) where chat_id is not null;

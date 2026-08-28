-- La trace des droits exercés par une personne.
--
-- POURQUOI CETTE TABLE EXISTE. Un droit d'accès ou d'effacement ne vaut que si
-- l'on peut montrer, plus tard, qu'il a été honoré. Sans registre, la seule
-- réponse possible à « avez-vous bien effacé mes données ? » serait « nous le
-- croyons » — ce qui n'est pas une réponse.
--
-- ELLE N'EST JAMAIS EFFACÉE PAR LA PURGE NOCTURNE, pour la même raison que
-- `relances_stop` : une règle de conservation ne doit pas effacer la trace d'un
-- droit exercé. C'est d'ailleurs le seul endroit où l'on garde délibérément le
-- numéro de quelqu'un qui a demandé l'effacement — et l'écran le lui dit.

create table if not exists public.demandes_droits (
  id uuid primary key default gen_random_uuid(),

  -- Le numéro national à dix chiffres, normalisé. On le garde en clair : un
  -- condensat empêcherait de répondre à la personne qui revient demander si sa
  -- demande a été traitée, ce qui est justement l'objet de cette table.
  telephone text not null,

  type text not null check (type in ('acces', 'effacement')),

  -- La commande qui a servi de preuve d'identité, et par quel moyen. Sert à
  -- retrouver une demande abusive : un effacement obtenu par devinette laisse
  -- ici la référence devinée et le moyen employé.
  reference text,
  preuve text not null check (preuve in ('jeton', 'telephone')),

  statut text not null default 'recue'
    check (statut in ('recue', 'honoree', 'refusee')),

  -- Le décompte de ce qui a été fait, et de ce qui ne l'a pas été.
  detail jsonb,

  cree_le timestamptz not null default now(),
  traite_le timestamptz
);

create index if not exists demandes_droits_telephone_idx
  on public.demandes_droits (telephone, cree_le desc);

-- RLS ACTIVÉE SANS AUCUNE POLICY, ET C'EST VOLONTAIRE.
--
-- Personne ne lit cette table par la clé publique : ni un visiteur, ni un
-- marchand connecté. Seul le service_role y accède, et il contourne RLS par
-- construction. Une table de demandes d'effacement lisible par `anon` serait
-- un annuaire des personnes qui ont voulu partir.
alter table public.demandes_droits enable row level security;

comment on table public.demandes_droits is
  'Trace des demandes d''accès et d''effacement. Jamais purgée : c''est la preuve qu''un droit a été honoré.';

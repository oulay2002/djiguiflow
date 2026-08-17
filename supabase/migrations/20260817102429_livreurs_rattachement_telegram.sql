-- Rattacher un livreur a son compte Telegram.
--
-- Telegram ne communique jamais le numero de telephone d'un utilisateur, et le
-- marchand ne peut pas connaitre a l'avance l'identifiant interne de son
-- livreur : il n'apparait qu'au moment ou celui-ci appuie sur un bouton. Le
-- lien se fait donc par un code d'invitation a usage unique, que le livreur
-- active en ouvrant le bot une fois.
--
-- Jusqu'ici l'annuaire vivait dans un onglet Google Sheets que le marchand
-- devait remplir a la main. La feuille est la tuyauterie de n8n, pas l'espace
-- de travail du marchand : une fausse manoeuvre y casse la production sans
-- prevenir, et Google y transforme « 0102918886 » en nombre, avalant le zero.

alter table public.livreurs
  add column if not exists telegram_id     text,
  add column if not exists code_invitation text,
  add column if not exists rattache_le     timestamptz;

comment on column public.livreurs.telegram_id is
  'Identifiant Telegram du livreur, pose automatiquement quand il active son lien d''invitation. Jamais saisi a la main.';
comment on column public.livreurs.code_invitation is
  'Secret du lien t.me/<bot>?start=<code>. Regenerable par le marchand ; sans valeur une fois le livreur rattache si on choisit de le revoquer.';

-- Un compte Telegram ne peut etre qu'un seul livreur chez un meme marchand,
-- sinon deux fiches se disputeraient les memes courses. L'index est partiel :
-- autant de livreurs non rattaches que l'on veut.
create unique index if not exists livreurs_telegram_unique
  on public.livreurs (boutique_id, telegram_id)
  where telegram_id is not null;

-- Le code voyage dans une URL publique : il doit designer une fiche et une
-- seule, toutes boutiques confondues.
create unique index if not exists livreurs_code_invitation_unique
  on public.livreurs (code_invitation)
  where code_invitation is not null;

-- Retrouver un livreur par son compte Telegram est fait a chaque course
-- acceptee : c'est le chemin chaud.
create index if not exists livreurs_par_telegram
  on public.livreurs (telegram_id)
  where telegram_id is not null;

-- Le nom d'utilisateur du bot est necessaire pour composer le lien
-- t.me/<bot>?start=<code>. Il est demande une fois a Telegram (getMe) puis
-- conserve ici : le jeton, lui, ne sort jamais du coffre.
alter table public.boutiques
  add column if not exists telegram_bot_username text;

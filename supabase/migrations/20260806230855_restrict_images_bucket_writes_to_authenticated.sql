-- La lecture reste publique (les photos sont affichées sur les vitrines publiques).
drop policy if exists "Allow public read access to images bucket" on storage.objects;
create policy "Lecture publique bucket images"
  on storage.objects for select
  to public
  using (bucket_id = 'images');

-- Ecriture reservee aux utilisateurs connectes (uploads faits depuis /dashboard).
drop policy if exists "Allow public uploads to images bucket" on storage.objects;
create policy "Upload images par utilisateur connecte"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'images');

drop policy if exists "Allow public updates to images bucket" on storage.objects;
create policy "Maj images par utilisateur connecte"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'images')
  with check (bucket_id = 'images');

drop policy if exists "Allow public deletes to images bucket" on storage.objects;
create policy "Suppression images par utilisateur connecte"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'images');

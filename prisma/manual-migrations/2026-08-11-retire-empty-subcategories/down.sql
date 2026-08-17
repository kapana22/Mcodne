-- Revert 2026-08-11-retire-empty-subcategories.
--
-- Re-creates the twelve rows with their previous names, parents and statuses.
-- Their IDs are NEW — nothing pointed at them (that is why they could be
-- deleted), so no foreign key is restored or needs to be.

BEGIN;

INSERT INTO "Category" ("id","slug","name","order","status","isLive","defaultServiceType","count","parentId")
SELECT gen_random_uuid()::text, v.slug, v.name, v.n, 'REDIRECTED', false, 'CONSULTATION', 0, p."id"
  FROM (VALUES
    ('career',      'კარიერა',            2, 'business'),
    ('hr',          'კადრები',            3, 'business'),
    ('crypto',      'კრიპტო',            12, 'tax'),
    ('design',      'დიზაინი',           32, 'marketing'),
    ('product',     'პროდუქტი',          41, 'it'),
    ('nutrition',   'დიეტოლოგია',        71, 'health'),
    ('fitness',     'ფიტნესი',           72, 'health'),
    ('interior',    'ინტერიერი',         76, 'architecture'),
    ('customs',     'ექსპორტი-იმპორტი',  81, 'logistics'),
    ('video',       'ფოტო და ვიდეო',     84, 'media'),
    ('translation', 'თარგმანი',          85, 'media'),
    ('tenders',     'ტენდერები',         87, 'grants')
  ) AS v(slug, name, n, parent)
  JOIN "Category" p ON p."slug" = v.parent
ON CONFLICT ("slug") DO NOTHING;

COMMIT;

-- Slice 4 submissions were authored by a non-authenticated demo identity.
-- They cannot be honestly attributed to a verified wallet, so do not carry them
-- into authenticated mission participation.
DELETE FROM "mission_submissions"
WHERE "user_id" IN (
  SELECT "id" FROM "users" WHERE "handle" = 'demo'
);

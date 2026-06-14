-- All id columns were `text NOT NULL` without a default because Prisma
-- generated CUIDs on the application side. Add gen_random_uuid()::text
-- so that inserts from Edge Functions (and PostgREST) don't need to supply id.
ALTER TABLE "AiGeneration"   ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "Completion"     ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "MissionChoice"  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "Organization"   ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "Progress"       ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "ServiceRequest" ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "User"           ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

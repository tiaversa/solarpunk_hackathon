-- Migrate from custom passwordHash to Supabase Auth
-- Users now authenticate via auth.users; User table becomes a profile

ALTER TABLE "User" ADD COLUMN "authId" UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- Trigger: auto-create User profile when a new auth.users row is inserted
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public."User" (id, email, "authId", "updatedAt")
  VALUES (gen_random_uuid()::text, NEW.email, NEW.id, now())
  ON CONFLICT (email) DO UPDATE SET "authId" = EXCLUDED."authId";
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- Cities table for fuzzy search (replaces cities.json in edge functions)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS cities (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    country TEXT NOT NULL,
    admin1 TEXT
);

CREATE INDEX cities_name_trgm_idx ON cities USING gin(name gin_trgm_ops);
CREATE INDEX cities_name_lower_idx ON cities (lower(name));

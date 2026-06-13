-- Step 1: enable the moddatetime contrib extension so later migrations
-- can use moddatetime() in BEFORE UPDATE triggers to auto-bump updatedAt.
-- No tables exist yet, so no triggers are created here.
CREATE EXTENSION IF NOT EXISTS moddatetime;

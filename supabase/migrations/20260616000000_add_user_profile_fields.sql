-- Add bio and phone to User table for the profile page
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "bio" TEXT CHECK (char_length("bio") <= 300);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phone" TEXT CHECK (char_length("phone") <= 30);

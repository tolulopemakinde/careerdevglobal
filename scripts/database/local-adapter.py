#!/usr/bin/env python3
"""Explicit local-only managed-schema adapter, NOT a Supabase managed schema backup."""
import json
from pathlib import Path
root=Path(__file__).resolve().parents[2]
helpers=json.loads((root/'supabase/baseline/managed-helper-definitions-2026-11-16.json').read_text())
sql='''BEGIN;
-- LOCAL-ONLY adapter. Auth API and physical Storage are NOT simulated by these tables.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE ROLE supabase_admin NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA storage;
CREATE SCHEMA extensions;
CREATE SCHEMA vault;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}',raw_app_meta_data jsonb DEFAULT '{}');
CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean DEFAULT false,file_size_limit bigint);
CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text REFERENCES storage.buckets(id),name text,owner uuid,owner_id text,metadata jsonb);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA auth,storage,extensions TO anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;
GRANT ALL ON storage.objects,storage.buckets TO service_role;
'''
print(sql+'\n'.join(h['definition'].rstrip().rstrip(';')+';' for h in helpers)+'\nCOMMIT;')

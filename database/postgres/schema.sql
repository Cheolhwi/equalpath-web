CREATE SCHEMA IF NOT EXISTS equalpath;
CREATE TABLE IF NOT EXISTS equalpath.web_data_releases (
 id text PRIMARY KEY, release_id text NOT NULL, source_hash text NOT NULL,
 status text NOT NULL, payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object')
);
CREATE TABLE IF NOT EXISTS equalpath.web_provider_catalog (
 id text PRIMARY KEY, provider_id text NOT NULL, provider_name text NOT NULL,
 state text NOT NULL, district text NOT NULL, care_type text NOT NULL,
 hours_status text NOT NULL, release_id text NOT NULL, payload jsonb NOT NULL,
 UNIQUE(provider_id, release_id)
);
CREATE INDEX IF NOT EXISTS catalog_release_state ON equalpath.web_provider_catalog(release_id,state);
CREATE TABLE IF NOT EXISTS equalpath.web_provider_evidence (
 id text PRIMARY KEY, provider_id text NOT NULL, release_id text NOT NULL,
 payload jsonb NOT NULL, UNIQUE(provider_id,release_id)
);
CREATE INDEX IF NOT EXISTS evidence_release ON equalpath.web_provider_evidence(release_id);
CREATE TABLE IF NOT EXISTS equalpath.web_provider_reviews (
 id text PRIMARY KEY, provider_id text NOT NULL, release_id text NOT NULL,
 source_kind text NOT NULL, source_review_id text NOT NULL, payload jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS reviews_provider_release ON equalpath.web_provider_reviews(provider_id,release_id);
CREATE TABLE IF NOT EXISTS equalpath.web_provider_photos (
 id text PRIMARY KEY, provider_id text NOT NULL, bucket_id text NOT NULL,
 file_id text NOT NULL, version text NOT NULL, payload jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS photos_provider ON equalpath.web_provider_photos(provider_id);
CREATE TABLE IF NOT EXISTS equalpath.storage_files (
 bucket_id text NOT NULL, file_id text NOT NULL, relative_path text NOT NULL UNIQUE,
 sha256 text NOT NULL CHECK(length(sha256)=64), size_bytes bigint NOT NULL CHECK(size_bytes>=0),
 mime_type text NOT NULL, PRIMARY KEY(bucket_id,file_id)
);
CREATE TABLE IF NOT EXISTS equalpath.provider_photo_files (
 photo_id text NOT NULL REFERENCES equalpath.web_provider_photos(id),
 ordinal integer NOT NULL CHECK(ordinal>=0), bucket_id text NOT NULL, file_id text NOT NULL,
 direction text, capture_date text, PRIMARY KEY(photo_id,ordinal),
 FOREIGN KEY(bucket_id,file_id) REFERENCES equalpath.storage_files(bucket_id,file_id)
);
-- Evidence component releases differ from the base catalogue release.
CREATE OR REPLACE VIEW equalpath.active_evidence AS
 SELECT e.*, r.release_id AS base_release_id
 FROM equalpath.web_provider_evidence e JOIN equalpath.web_data_releases r ON r.id='current'
 AND (e.release_id=r.release_id OR EXISTS (
 SELECT 1 FROM jsonb_each_text(r.payload) p WHERE p.key LIKE '%\_release' ESCAPE '\' AND p.value=e.release_id));
CREATE OR REPLACE VIEW equalpath.active_catalog AS
 SELECT c.* FROM equalpath.web_provider_catalog c JOIN equalpath.web_data_releases r
 ON r.id='current' AND c.release_id=r.release_id;
-- Supplementary providers can exist only in additions evidence, not the base table.
CREATE OR REPLACE VIEW equalpath.provider_evidence_links AS
 SELECT c.id AS catalog_row_id,e.id AS evidence_row_id,c.provider_id,e.release_id
 FROM equalpath.active_catalog c JOIN equalpath.active_evidence e USING(provider_id);
CREATE OR REPLACE VIEW equalpath.provider_review_links AS
 SELECT c.id AS catalog_row_id,v.id AS review_row_id,c.provider_id,v.provider_id AS review_source_provider_id
 FROM equalpath.web_provider_catalog c JOIN equalpath.web_provider_reviews v
 ON v.provider_id=COALESCE(NULLIF(c.payload #>> '{reviews,source_provider_id}',''),c.provider_id)
 AND v.release_id=c.release_id;
CREATE OR REPLACE VIEW equalpath.local_photo_gallery AS
 SELECT p.provider_id,l.ordinal,l.direction,l.capture_date,f.relative_path,f.sha256,f.size_bytes
 FROM equalpath.web_provider_photos p JOIN equalpath.provider_photo_files l ON l.photo_id=p.id
 JOIN equalpath.storage_files f ON f.bucket_id=l.bucket_id AND f.file_id=l.file_id;
-- Exact prepared website partitions and review extras, imported from this commit.
CREATE TABLE IF NOT EXISTS equalpath.runtime_documents (
 id text PRIMARY KEY, payload jsonb NOT NULL
);

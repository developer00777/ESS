-- One-time local setup on the Windows PostgreSQL 16 service (port 5433).
CREATE ROLE champ_hr LOGIN PASSWORD 'champ_hr';
CREATE DATABASE champ_hr OWNER champ_hr;

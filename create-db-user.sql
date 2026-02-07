-- Create user and database
CREATE USER IF NOT EXISTS mediczy_helper WITH PASSWORD 'Mediczy2024Helper';
CREATE DATABASE mediczy_ai OWNER mediczy_helper;
GRANT ALL PRIVILEGES ON DATABASE mediczy_ai TO mediczy_helper;

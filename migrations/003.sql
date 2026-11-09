-- Login com Google: a coluna google_sub é criada pelo servidor (ALTER TABLE) antes deste índice.
CREATE UNIQUE INDEX IF NOT EXISTS users_google ON users(google_sub) WHERE google_sub IS NOT NULL;

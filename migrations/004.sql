-- Imagens geradas pelos modelos. Ficam fora do JSON da conversa para não estourar o
-- limite de tamanho; a mensagem guarda só o endereço /api/media/<id>.
CREATE TABLE IF NOT EXISTS media(id TEXT PRIMARY KEY,user TEXT NOT NULL REFERENCES users ON DELETE CASCADE,chat TEXT REFERENCES chats ON DELETE CASCADE,mime TEXT NOT NULL,data BLOB NOT NULL,created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS media_owner ON media(user, chat);

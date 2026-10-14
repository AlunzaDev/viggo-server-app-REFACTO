-- CreateIndex
CREATE INDEX "local_installations_sync_token_hash_idx" ON "local_installations"("sync_token_hash");

-- CreateIndex
CREATE INDEX "proyectos_installation_link_token_hash_idx" ON "proyectos"("installation_link_token_hash");

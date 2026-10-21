-- Espacio de trabajo con el que se está trabajando.
--
-- Una persona puede pertenecer a varios estudios. Sin este dato, la sesión
-- siempre caía en el más antiguo y quien aceptaba una invitación a otro
-- estudio no llegaba a verlo.
ALTER TABLE "sessions" ADD COLUMN "workspaceId" UUID;

-- Índice para localizar las sesiones de un espacio de trabajo.
CREATE INDEX "sessions_workspaceId_idx" ON "sessions"("workspaceId");

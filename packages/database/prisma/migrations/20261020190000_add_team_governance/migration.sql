-- AlterTable
ALTER TABLE "book_sections" ADD COLUMN     "assigneeId" UUID;

-- AlterTable
ALTER TABLE "editorial_comments" ADD COLUMN     "assigneeId" UUID;

-- CreateTable
CREATE TABLE "workspace_invitations" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'AUTHOR',
    "tokenHash" VARCHAR(64) NOT NULL,
    "invitedById" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workspace_invitations_tokenHash_key" ON "workspace_invitations"("tokenHash");

-- CreateIndex
CREATE INDEX "workspace_invitations_workspaceId_createdAt_idx" ON "workspace_invitations"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "workspace_invitations_email_idx" ON "workspace_invitations"("email");

-- CreateIndex
CREATE INDEX "workspace_invitations_expiresAt_idx" ON "workspace_invitations"("expiresAt");

-- CreateIndex
CREATE INDEX "book_sections_assigneeId_idx" ON "book_sections"("assigneeId");

-- CreateIndex
CREATE INDEX "editorial_comments_assigneeId_idx" ON "editorial_comments"("assigneeId");

-- AddForeignKey
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_sections" ADD CONSTRAINT "book_sections_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editorial_comments" ADD CONSTRAINT "editorial_comments_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Restricciones de integridad propias del proyecto.
--
-- Una invitación que caduca antes de crearse no tiene sentido, y una
-- invitación no puede estar aceptada y revocada a la vez.
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_expires_after_creation"
  CHECK ("expiresAt" > "createdAt");

ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_not_accepted_and_revoked"
  CHECK (NOT ("acceptedAt" IS NOT NULL AND "revokedAt" IS NOT NULL));

COMMENT ON TABLE "workspace_invitations" IS
  'Invitaciones de acceso a un espacio de trabajo. Solo se guarda la huella del token.';

COMMENT ON COLUMN "book_sections"."assigneeId" IS
  'Persona a la que se asigna el trabajo de la seccion.';

COMMENT ON COLUMN "editorial_comments"."assigneeId" IS
  'Persona a la que se asigna el comentario.';

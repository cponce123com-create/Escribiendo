-- AlterEnum
-- Formatos de texto ligero: Markdown, HTML y texto plano. Son aditivos: no
-- afectan a los trabajos de exportación existentes.
ALTER TYPE "ExportFormat" ADD VALUE 'MARKDOWN';
ALTER TYPE "ExportFormat" ADD VALUE 'HTML';
ALTER TYPE "ExportFormat" ADD VALUE 'TXT';

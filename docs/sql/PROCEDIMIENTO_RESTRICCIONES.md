# Procedimiento para aplicar las restricciones de integridad de secciones

Este documento describe cómo llevar a producción las restricciones de
`proposed-section-constraints.sql` **sin reparar manuscritos en silencio**.
No es una migración de Prisma ni debe ejecutarse a ciegas en el editor SQL de
Neon.

## Qué añade la propuesta

1. `book_sections_id_book_key`: índice único `(id, "bookId")`, necesario como
   destino de la clave foránea compuesta.
2. `book_sections_parent_same_book`: la sección padre debe pertenecer al mismo
   libro que la hija.
3. `book_sections_not_self_parent`: una sección no puede ser su propio padre.

Las restricciones 2 y 3 se añaden con `NOT VALID`: no revisan las filas
existentes hasta que se ejecuta `VALIDATE CONSTRAINT`. Eso permite separar la
aplicación del esquema de la comprobación de datos.

La propuesta **no evita ciclos de varias filas** (A → B → A). Eso requiere
serialización en la aplicación y pruebas de integración; no se resuelve con
estas restricciones.

## Antes de empezar

- [ ] Respaldo o punto de restauración de Neon confirmado.
- [ ] Rama o base desechable de Neon para el ensayo.
- [ ] `DIRECT_URL` apuntando a la conexión directa (sin `pgbouncer=true`).
- [ ] Ventana de mantenimiento acordada si la tabla es grande.
- [ ] Resultados de la auditoría revisados y remediación aprobada por quien
      responde del manuscrito.

## 1. Diagnóstico (solo lectura)

Ejecutar `sql/audit-section-integrity.sql` en la base de ensayo y guardar el
resultado. Devuelve:

- `MISSING_PARENT`: el padre no existe.
- `CROSS_BOOK_PARENT`: el padre pertenece a otro libro.
- `DELETED_PARENT`: el padre está borrado y la hija no.
- `cyclic_section`: secciones dentro de un ciclo.
- Duplicados de `("bookId", "parentId", "sortOrder")`.

No ejecutar la propuesta si cualquiera de las consultas devuelve filas sin una
decisión editorial explícita.

## 2. Remediación manual

Cada caso se corrige con el identificador delante y revisando el manuscrito.
Nunca usar un `UPDATE` masivo sin `WHERE` explícito.

```sql
-- Ejemplo: dejar sin padre una sección cuyo padre no existe.
-- Sustituir el UUID tras revisar la fila concreta.
UPDATE book_sections
SET "parentId" = NULL, "updatedAt" = now()
WHERE id = '<uuid-de-la-seccion>' AND "parentId" = '<uuid-inexistente>';

-- Ejemplo: reasignar un padre de otro libro a la sección correcta del mismo libro.
UPDATE book_sections
SET "parentId" = '<uuid-del-padre-correcto>', "updatedAt" = now()
WHERE id = '<uuid-de-la-seccion>';

-- Ejemplo: renumerar un `sortOrder` duplicado.
UPDATE book_sections
SET "sortOrder" = <nuevo-valor>, "updatedAt" = now()
WHERE id = '<uuid-de-la-seccion>';
```

Para los ciclos: romper el ciclo moviendo una de las secciones a `NULL` o a un
padre fuera del ciclo. No hay reparación automática.

Después de cada tanda, volver a ejecutar la auditoría hasta que las consultas
devuelvan cero filas.

## 3. Ensayo en base desechable

Usar `lock_timeout` para no bloquear la tabla más de lo previsto. El índice
único conviene crearlo con `CONCURRENTLY`, fuera de una transacción:

```sql
SET lock_timeout = '5s';

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS book_sections_id_book_key
  ON book_sections (id, "bookId");
```

Después, añadir las restricciones y validarlas:

```sql
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE book_sections ADD CONSTRAINT book_sections_parent_same_book
  FOREIGN KEY ("parentId", "bookId") REFERENCES book_sections (id, "bookId")
  ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID;

ALTER TABLE book_sections ADD CONSTRAINT book_sections_not_self_parent
  CHECK ("parentId" IS DISTINCT FROM id) NOT VALID;

COMMIT;

ALTER TABLE book_sections VALIDATE CONSTRAINT book_sections_parent_same_book;
ALTER TABLE book_sections VALIDATE CONSTRAINT book_sections_not_self_parent;
```

`ADD CONSTRAINT` toma un bloqueo breve pero exclusivo; `VALIDATE CONSTRAINT`
permite escrituras mientras comprueba las filas. Medir ambas operaciones en el
ensayo y repetir el tiempo en la ventana de producción.

## 4. Verificación de comportamiento

Comprobar que las restricciones existen y que rechazan los casos prohibidos.
Los bloques siguientes usan subtransacciones: si la restricción funciona, el
cambio se revierte y solo queda el aviso.

```sql
-- Auto-padre: debe fallar con check_violation.
DO $$
BEGIN
  BEGIN
    UPDATE book_sections SET "parentId" = id WHERE id = '<uuid-de-la-seccion>';
    RAISE EXCEPTION 'FALLO: se permitió que una sección fuera su propio padre';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK: auto-padre rechazado';
  END;
END $$;

-- Padre de otro libro: debe fallar con foreign_key_violation.
DO $$
BEGIN
  BEGIN
    UPDATE book_sections SET "parentId" = '<uuid-de-otro-libro>'
    WHERE id = '<uuid-de-la-seccion>';
    RAISE EXCEPTION 'FALLO: se permitió un padre de otro libro';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'OK: padre de otro libro rechazado';
  END;
END $$;
```

Comprobar también las definiciones:

```sql
SELECT conname, contype, convalidated
FROM pg_constraint
WHERE conrelid = 'book_sections'::regclass
  AND conname IN ('book_sections_parent_same_book', 'book_sections_not_self_parent');

SELECT indexname FROM pg_indexes
WHERE tablename = 'book_sections' AND indexname = 'book_sections_id_book_key';
```

## 5. Producción

1. Repetir el diagnóstico en producción y confirmar cero filas.
2. Confirmar el respaldo.
3. Crear el índice con `CONCURRENTLY` y `lock_timeout`.
4. Añadir las restricciones `NOT VALID` en una transacción breve.
5. Validar cada restricción por separado.
6. Ejecutar las verificaciones de comportamiento.
7. Anotar fecha, duración y resultado en el registro de cambios.

## Rollback

Las restricciones no alteran el contenido de los manuscritos. Para revertir:

```sql
ALTER TABLE book_sections DROP CONSTRAINT IF EXISTS book_sections_parent_same_book;
ALTER TABLE book_sections DROP CONSTRAINT IF EXISTS book_sections_not_self_parent;
DROP INDEX IF EXISTS book_sections_id_book_key;
```

## Limitaciones y notas

- Prisma no modela la clave foránea compuesta en `schema.prisma`; las
  restricciones viven solo en PostgreSQL. Hay que documentarlas y no
  regenerarlas con `prisma db push`.
- El índice `(id, "bookId")` es redundante con la clave primaria, pero es el
  destino obligatorio de la clave foránea compuesta.
- Los ciclos multi-fila siguen dependiendo de la aplicación.
- No se han modificado los checksums de las migraciones existentes.

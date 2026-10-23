# E3: decisión pendiente sobre eliminación de secciones

No se modifican los permisos actuales. La interfaz y el servidor siguen exigiendo `section:delete` según el rol del espacio de trabajo.

## Opción A: permitir borrar a quien creó la sección

Autorizar también a la persona creadora, siempre dentro del libro y espacio de trabajo autorizados. Antes de adoptarlo hay que definir qué ocurre si las subsecciones pertenecen a otras personas, si el creador deja el estudio o si la sección está aprobada/bloqueada. El servidor debe comprobar la propiedad; ocultar botones no basta.

## Opción B: papelera y restauración

Mantener los permisos por rol y ofrecer recuperación del borrado lógico existente (`deletedAt`). Hay que definir retención, permisos para restaurar/vaciar, restauración del árbol, conflictos de nombres y destino del contenido cuyo padre ya no exista. Evita que un borrado accidental sea definitivo para el usuario, pero requiere una interfaz y auditoría propias.

Pendiente de decisión de producto. E1 incorpora confirmación con el número de descendientes y conserva las restricciones actuales; no implementa ninguna de estas dos políticas.

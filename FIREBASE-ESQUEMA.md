# Firebase para Distribuidora Zipper

Proyecto: `zipper-a12f1`. Organización Firestore: `orgs/zipper-a12f1`.

## Requisitos de uso y seguridad

- El modo local del teléfono sigue disponible y es el modo inicial.
- Activar nube debe ser una acción explícita desde la app. Conectar Firebase no debe subir datos sin que el dueño lo confirme.
- Mantener intactos los datos locales y el respaldo JSON. Antes de la primera importación, generar una copia y mostrar un resumen para confirmar.
- El dueño puede ver las cajas y movimientos de todos los vendedores. Cada vendedor solo ve sus propios datos financieros y no puede ver ganancias ajenas.
- La ficha de clientes es compartida, con asignaciones de ruta/día por vendedor.
- Todos los miembros pueden consultar productos e inventario. Solo el dueño puede crear, modificar o borrar productos y stock.

## Colecciones

Todos los datos quedan bajo `orgs/zipper-a12f1`:

- `members/{uid}`: `displayName`, `role` (`owner` o `seller`), `active`.
- `products/{productId}`: catálogo, precio y stock.
- `clients/{clientId}`: datos compartidos del cliente; `assignedSellerUids` limita qué vendedores lo consultan y `sellerRoutes.{sellerUid}.{week}` guarda el día y la posición de cada ruta semanal.
- `sales/{saleId}`: cliente, detalle, fecha, forma de pago y `sellerUid`.
- `sessions/{sessionId}`: apertura, primera venta y cierre, con `sellerUid`.
- `cashMovements/{movementId}`: abonos, gastos u otros movimientos, con `sellerUid`.
- `visits/{visitId}`: registro de visitas por cliente, fecha y vendedor.

Los perfiles se verifican con Firebase Authentication y se autorizan por el documento `members/{uid}`. La app no debe permitir que una cuenta cree o cambie su propio rol. Nunca se almacenan contraseñas en Firestore.

## Mapeo desde el almacenamiento actual

La app usa estas claves locales; deben conservarse para respaldos y modo local:

- `zipperClientes` → `clients`
- `zipperProductos` → `products`
- `zipperComprobantes` → `sales`
- `zipperPagos` y `zipperGastosCaja` → `cashMovements`
- `zipperVisitados-AAAA-MM-DD` → `visits`
- `zipperCategorias` y `zipperCategoriasEliminadas` → configuración de la organización

La carga inicial debe ser una operación separada, iniciada por el dueño después de revisar cuántos clientes, productos, ventas, abonos y gastos se importarán. No reemplazar ni borrar datos locales automáticamente. Evitar migrar registros de caja sin identificador propio o reasignarlos a un vendedor sin confirmación; algunos abonos antiguos pueden no estar vinculados a una venta.

## Estado de esta preparación

El documento de propietario ya fue creado y revisado en Firebase Console. Su UID y otros datos personales no se guardan en este repositorio.

El borrador ya incluye conexión y sincronización opcional del dueño, importación confirmada y asignación de rutas de clientes por vendedor. El inicio de sesión de vendedor seguirá bloqueado hasta terminar su vista separada y el descuento seguro de inventario.

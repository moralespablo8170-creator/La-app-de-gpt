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
- `sales/{saleId}`: cliente, detalle, fecha, forma de pago, `sellerUid`, semana/día de ruta y `clientZone` copiada al momento de la venta para conservar la zona histórica.
- El panel del dueño agrupa ventas por mes, vendedor, zona y ruta; el porcentaje significa participación del vendedor en el total vendido de esa zona durante el mes.
- `sessions/{sessionId}`: apertura, primera venta y cierre, con `sellerUid`.
- `cashMovements/{movementId}`: abonos, gastos u otros movimientos, con `sellerUid`.
- `visits/{visitId}`: registro de visitas por cliente, fecha y vendedor.
- `productCosts/{productId}`: costo actual de compra, solo lectura y escritura del dueño; nunca accesible a vendedores.
- `sellerSaleCosts/{saleId}`: copia privada e inmutable del costo unitario usado en cada venta, con cantidades, ingreso, costo y ganancia bruta por línea. Solo el dueño puede leerla; la escribe un proceso de servidor confiable, nunca el navegador del vendedor.
- `sellerCompensation/{sellerUid}`: sueldo base mensual y tramos de metas/porcentajes configurados por vendedor. Solo el dueño puede leer o modificar esta colección.

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

## Costos privados y ganancia histórica

No calcular la ganancia histórica de una venta con el costo actual del producto: ese valor puede haber cambiado desde la fecha de venta. La cifra por venta debe calcularse en un proceso confiable del servidor al confirmar la venta y guardar el resultado en `sellerSaleCosts/{saleId}`. El registro debe ser idempotente para soportar reintentos y marcar productos sin costo conocido como “pendientes de revisión”, nunca asignarles costo cero automáticamente.

Los vendedores no pueden leer ni escribir `productCosts` ni `sellerSaleCosts`. El panel del dueño puede mostrar la ganancia bruta histórica desde las copias de costo; los gastos se descuentan por separado para obtener ganancia neta. No se publicará un margen aproximado como si fuera histórico.

La remuneración se configura por vendedor: sueldo base mensual y una escala de metas. Las metas se comparan con las ventas del mes sumadas entre todas las zonas. El porcentaje de cada tramo se aplica solo al monto que supera su umbral; el sueldo base se suma al resultado. Los tramos pueden extenderse sin límite fijo para permitir bonos posteriores a la tercera meta. La estimación se etiqueta como bruta, antes de descuentos legales u otros pagos.

Para publicar Cloud Functions se requiere el plan Blaze de Firebase. El código del borrador no debe desplegarse ni cambiar el plan del proyecto sin una decisión explícita del dueño. Mientras no exista el proceso confiable desplegado, la ganancia histórica de ventas de vendedor permanece sin calcular y el modo vendedor continúa desactivado.

## Estado de esta preparación

El documento de propietario fue creado y revisado en Firebase Console. Su UID y otros datos personales no se guardan en este repositorio.

El borrador incluye conexión y sincronización opcional del dueño, importación confirmada, rutas de clientes y una vista separada del vendedor con descuento de inventario. El panel permite asociar un perfil a un UID ya creado en Firebase Authentication y activar/desactivar ese perfil; no crea cuentas ni captura contraseñas. El modo vendedor sigue desactivado.

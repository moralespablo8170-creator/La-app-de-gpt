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
- `sales/{saleId}`: cliente, detalle, fecha, forma de pago, `sellerUid`, semana/día de ruta y `clientZone` copiada al momento de la venta para conservar la zona histórica. Las ventas de vendedor solo admiten efectivo o transferencia. Se guardan inicialmente como `collectionStatus: awaiting_delivery`: es un cobro a realizar por quien entrega, no crédito ni dinero recibido por el vendedor. Solo el dueño confirma el cobro en Caja diaria; al confirmarlo la venta pasa a `collectionStatus: collected`. No puede crear ventas a crédito ni abonos.
- El panel del dueño agrupa ventas por mes, vendedor, zona y ruta; el porcentaje significa participación del vendedor en el total vendido de esa zona durante el mes.
- `sessions/{sessionId}`: apertura, primera venta y cierre, con `sellerUid`. Un vendedor solo escribe su propia jornada y con los campos/estados permitidos; el dueño puede administrar todas.
- `cashMovements/{movementId}`: abonos, gastos u otros movimientos, con `sellerUid`. Solo el dueño puede crear, modificar o borrar movimientos; cada vendedor puede consultar solo los propios.
- `visits/{visitId}`: registro de visitas por cliente, fecha y vendedor. Las reglas exigen que un vendedor solo registre visitas a clientes, semanas y días asignados a su perfil.
- `productCosts/{productId}`: costo actual de compra, solo lectura y escritura del dueño; nunca accesible a vendedores.
- `sellerSaleCosts/{saleId}`: copia privada e inmutable del costo unitario usado en cada venta, con cantidades, ingreso, costo y ganancia bruta por línea. Solo el dueño puede leerla; la escribe un proceso de servidor confiable, nunca el navegador del vendedor.
- `sellerCompensation/{sellerUid_YYYY-MM}`: sueldo base mensual y tramos de metas/porcentajes de un vendedor, con `effectiveMonth`. Cada versión rige desde ese mes hasta la siguiente; así, actualizar sueldo o porcentaje no modifica cálculos de meses anteriores. Solo el dueño puede leer o modificar esta colección.

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

La remuneración se configura por vendedor y mes de vigencia: sueldo base mensual y una escala de metas versionada. Cada versión aplica desde el mes guardado hasta la siguiente; los cambios futuros no reescriben meses anteriores. Las metas se comparan con las ventas del mes sumadas entre todas las zonas. El porcentaje de cada tramo se aplica solo al monto que supera su umbral; el sueldo base se suma al resultado. La escala puede extenderse con más tramos de comisión después de la tercera meta; no se contemplan bonos adicionales. La estimación se etiqueta como bruta, antes de descuentos legales u otros pagos.

Para publicar Cloud Functions se requiere vincular una cuenta de Cloud Billing, lo que lleva el proyecto al plan Blaze. El código del borrador no debe desplegarse ni cambiar el plan del proyecto sin una decisión explícita del dueño. Mientras no exista el proceso confiable de costos desplegado, la ganancia histórica de ventas de vendedor permanece sin calcular y el modo vendedor continúa desactivado.

## Estado de esta preparación

El documento de propietario fue creado y revisado en Firebase Console. Su UID y otros datos personales no se guardan en este repositorio. La vista `/preview/pr-9/` usa `firebase-test-config.js` y falla si esa configuración está incompleta o apunta al proyecto real. Las funciones obtienen su organización desde `process.env.FIREBASE_CONFIG.projectId`; `.firebaserc` no define un destino predeterminado, de modo que un despliegue requiere especificar proyecto.

El borrador incluye conexión y sincronización opcional del dueño, importación confirmada, rutas de clientes y una vista separada del vendedor con descuento de inventario. La venta del vendedor solo registra efectivo o transferencia y no modifica movimientos de caja; el cobro corresponde a la persona que entrega. El panel de control se prepara para crear cuentas individuales mediante `createSellerAccount` y cambiar permisos mediante `setSellerAccess`, funciones que verifican al propietario activo antes de usar Firebase Admin SDK. La clave inicial no se guarda en Firestore. Mientras las funciones no se desplieguen, la desactivación actualiza el perfil en Firestore; las reglas bloquean operaciones y la app del vendedor cierra sesión al recibir el cambio, pero Authentication todavía no se deshabilita. Con las funciones desplegadas, `setSellerAccess` también deshabilitará la cuenta y revocará tokens. El formulario de creación permanece desactivado hasta autorizar la vinculación de facturación y el despliegue. No se crearon vendedores ficticios ni se desplegaron funciones en el proyecto real; el modo vendedor continúa desactivado.

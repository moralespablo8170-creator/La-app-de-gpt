# Firebase para Distribuidora Zipper

Este esquema usa el proyecto Firebase `zipper-a12f1` y una organización fija `zipper-a12f1` dentro de Firestore.

## Colecciones

Todos los datos quedan bajo `orgs/zipper-a12f1`:

- `members/{uid}`: perfil y rol. Campos: `displayName`, `role` (`owner` o `seller`), `active`.
- `products/{productId}`: catálogo e inventario. Todos los miembros leen; solo el dueño modifica.
- `clients/{clientId}`: clientes y asignación de semana/día/ruta compartidos.
- `sales/{saleId}`: venta con `sellerUid`, cliente, detalle, fecha y medio de pago.
- `sessions/{sessionId}`: apertura, hora de primera venta y cierre por vendedor.
- `cashMovements/{movementId}`: abonos y otros movimientos atribuidos a `sellerUid`.

El dueño puede consultar los movimientos de todos. Cada vendedor solo puede consultar sus propias ventas, sesiones y movimientos. Los vendedores no pueden cambiar el inventario.

## Alta del dueño y vendedores

Firebase Authentication verifica el correo y la contraseña. Los permisos se guardan por separado en `members/{uid}`; cada perfil debe crearlo el dueño desde un flujo administrativo protegido o desde Firebase Console. No se debe permitir que la app cree o cambie su propio rol.

No se guardan contraseñas en Firestore ni se muestran al dueño. Para dar acceso, se crea una cuenta de autenticación y se asigna su UID al perfil de vendedor. Para retirar el acceso, se establece `active: false`.

## Estado de esta preparación

El documento de propietario ya fue creado y revisado en Firebase Console. Su UID y otros datos personales no se guardan en este repositorio.

La aplicación todavía no sincroniza datos con Firestore. La integración debe mapear los datos actuales del teléfono a estas colecciones y conservar una copia local antes de activar la nube. La siguiente etapa es integrar autenticación, permisos por rol y una migración controlada, sin reemplazar los datos locales.

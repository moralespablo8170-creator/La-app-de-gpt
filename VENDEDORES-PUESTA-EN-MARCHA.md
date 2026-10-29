# Puesta en marcha de vendedores: ruta sin costo fijo

Esta guía conserva la app maestra en modo local hasta que se contrate al primer vendedor. No es necesario vincular facturación, crear usuarios ni migrar datos mientras la app se usa solo en el teléfono.

## Qué queda listo desde ahora

- La app principal mantiene el almacenamiento local del teléfono como opción inicial.
- El modo vendedor, la importación de datos y la preparación del catálogo requieren acciones separadas del dueño.
- El borrador incluye el acceso del vendedor, sus rutas, visitas, jornadas y ventas, con inventario solo de consulta.
- El alta directa desde el panel está apagada. La opción de servidor seguro se habilitará solo si se elige Blaze y se despliegan Cloud Functions.
- No se han creado vendedores ficticios ni se han migrado datos del proyecto Firebase real.

## Al contratar al primer vendedor: empezar en Spark

Se puede mantener Firebase en el plan gratuito usando alta manual de la cuenta y las cuotas gratuitas de Firestore. En este camino el dueño crea la cuenta en Firebase Console y luego asocia su UID al perfil vendedor. El propietario conserva el control desde la app.

1. Guardar y revisar un respaldo actualizado de la app del teléfono.
2. Iniciar sesión en la app maestra y elegir explícitamente la conexión con Firebase. Revisar el resumen y confirmar la importación local; los datos originales permanecen en el teléfono.
3. En Control de vendedores, ejecutar **Preparar catálogo seguro** tras confirmar el respaldo. Esto separa los costos de compra del catálogo visible para el vendedor y habilita el modo vendedor.
4. En Firebase Console, crear el usuario de correo y contraseña en **Authentication**. Copiar su UID.
5. En **Firestore Database**, crear `orgs/zipper-a12f1/members/{UID}` con estos campos:
   - `displayName`: nombre del vendedor (texto).
   - `role`: `seller` (texto).
   - `active`: `true` (booleano).
   - `email`: correo del usuario (texto, recomendado).
6. En la app maestra, asignar clientes y sus rutas de semana/día al vendedor.
7. Entregarle el enlace de la app y sus credenciales. El vendedor inicia sesión desde Chrome y puede instalarla como aplicación en su teléfono.

El plan Spark no pide una cuenta de facturación. Firestore ofrece cuotas gratuitas para empezar; si se supera una cuota, el servicio puede detenerse durante el resto del mes en vez de facturar automáticamente.

## Bloquear el acceso

Desde Control de vendedores, el dueño puede desactivar el perfil. Las reglas de Firestore rechazan sus operaciones y la app del vendedor cierra la sesión y borra su caché de vendedor al recibir el cambio. En el camino Spark, el usuario de Authentication queda creado, pero el perfil desactivado le impide entrar a los datos de la empresa. Esto requiere conexión para que el teléfono reciba el cambio.

## Cuándo considerar Blaze

Blaze no es necesario para usar Authentication por correo y Firestore dentro de sus cuotas gratuitas. Se necesita vincular Cloud Billing para desplegar las Cloud Functions que permiten:

- Crear o desactivar la cuenta de Authentication directamente desde la app maestra.
- Deshabilitar la cuenta y revocar sus sesiones desde el servidor.
- Guardar de forma confiable el costo histórico privado de cada venta del vendedor para calcular ganancias históricas.

Blaze es pago por uso, no una tarifa mensual fija. Las cuotas gratuitas siguen aplicando, pero un uso por encima de ellas u otros servicios habilitados pueden generar cobros. La app debe permanecer en Spark mientras esas funciones no sean necesarias. Vincular facturación y desplegar el backend requiere una decisión explícita del dueño.

## Estado de esta guía

Este documento pertenece al borrador de preparación de vendedores. No modifica Firebase, la app principal publicada, ni los datos del teléfono. Antes de entregar una cuenta real, hay que probar el flujo en un proyecto Firebase de pruebas separado.

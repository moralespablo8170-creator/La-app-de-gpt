# Distribuidora Zipper

Aplicación web para gestionar comprobantes y clientes.

## Funciones actuales

- Crear comprobantes con numeración automática.
- Seleccionar clientes registrados.
- Agregar productos, cantidades y precios.
- Cálculo automático del total.
- Guardar y editar comprobantes.
- Historial con búsqueda y filtros por fecha.
- Eliminar comprobantes.
- Gestión de clientes activos e inactivos.
- Editar, activar/desactivar y eliminar clientes.
- Respaldo y restauración en JSON.
- Impresión / PDF del comprobante.
- Almacenamiento local del navegador.
- Soporte básico sin conexión mediante Service Worker.

## Estructura

- `index.html` — interfaz.
- `styles.css` — diseño y versión para impresión.
- `app.js` — lógica de comprobantes, historial y clientes.
- `manifest.json` — configuración de aplicación instalable.
- `sw.js` — caché básica para uso sin conexión.

> Los datos actuales se guardan en el almacenamiento local del dispositivo/navegador. Antes de cambiar de dispositivo se debe utilizar la opción de respaldo.

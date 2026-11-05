# Nica Decants Manager

Aplicación comercial interna para administrar inventario, clientes, ventas, importaciones, costos y finanzas. El frontend usa React + Vite; Supabase Auth identifica al usuario y RLS/RPC valida los permisos y las operaciones.

## Desarrollo local

1. Instala Node.js y ejecuta `npm install`.
2. Copia `.env.example` a `.env.local` y configura `VITE_SUPABASE_URL` y la clave publicable/anon.
3. Ejecuta `npm run dev`.

No uses claves `service_role`, claves secretas ni contraseñas de base de datos en el navegador.

## Base de datos

En un proyecto Supabase nuevo, ejecuta los archivos SQL de `supabase/migrations/` en orden por nombre. Esto incluye el esquema base `202610270001_initial_schema.sql`, el sistema comercial `202610270003_commercial_system.sql`, los contratos actuales `202611030000_runtime_contracts.sql` y la recepción de importaciones `202611030001_import_products_receiving.sql`. El archivo `202610270002_sales_rpc.sql` está vacío y puede omitirse.

Para una base existente, haz primero una copia de seguridad y ejecuta las migraciones nuevas `202611030000_runtime_contracts.sql` y `202611030001_import_products_receiving.sql` en SQL Editor. Son aditivas, pero deben revisarse con el estado real de esa base antes de aplicarlas; no borres ni recrees tablas con datos.

Después crea el usuario administrador en Supabase Auth y asigna su perfil con `role = 'admin'`. Los perfiles de empleados deben tener `role = 'employee'` y estar activos. Los clientes web no pueden asignarse permisos.

La tasa central inicia en C$37.11 por US$1. Cada compra, importación, pago o gasto debe conservar la tasa registrada, de modo que actualizar la tasa central solo afecte nuevas operaciones.

## Funciones actuales y límites conocidos

- Inicio de sesión, perfil, permisos por rol y lectura de productos/clientes.
- Inventario: alta/edición administrativa, entradas, ajustes y registro de movimientos mediante RPC.
- Ventas: emisión transaccional, numeración consecutiva, descuento de existencias, pago inicial y cargos/costos de entrega.
- Clientes: alta/edición y saldo pendiente calculado desde ventas emitidas y pagos registrados.
- Importaciones: agencia, origen, transporte, peso, tarifas, abonos y recepción de productos en inventario.
- Costos y finanzas son solo para administración; las tablas privadas de costos no son visibles a empleados.
- El historial/PDF comercial de facturas y los pagos posteriores a la venta todavía requieren una pantalla/flujo adicional.

La compilación de producción se verifica con `npm run build`.

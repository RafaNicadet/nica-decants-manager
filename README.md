# Nica Decants Manager — starter web

Aplicación inicial React + Vite + Supabase para continuar el sistema desde el navegador. Incluye inicio de sesión, lectura de perfil, productos y clientes, navegación por rol y una interfaz adaptable. No incluye todavía operaciones de escritura de ventas, facturación ni inventario; se mantienen bloqueadas hasta implementar las RPC transaccionales.

## Requisitos de datos

- El esquema SQL inicial de `supabase/migrations/` debe revisarse y ejecutarse en un proyecto de desarrollo de Supabase.
- Crear el usuario administrador en Supabase Authentication y luego su fila en `public.profiles`.
- Para invitar empleados, crear usuarios mediante Supabase Auth y sus perfiles desde una herramienta administrativa segura. No permitir que el cliente web elija su propio rol.
- La tabla `products` debe tener filas antes de que aparezcan productos en la interfaz.

## Opción recomendada: trabajar desde el navegador

1. Crea un repositorio privado en GitHub y sube estos archivos.
2. Abre el repositorio en GitHub Codespaces (si está disponible en tu cuenta) o usa un entorno de desarrollo en línea compatible con Node.
3. En la terminal del entorno ejecuta `npm install`.
4. Copia `.env.example` a `.env.local` y rellena la Project URL y la publishable/anon key de Supabase.
5. Ejecuta `npm run dev -- --host 0.0.0.0` y abre el puerto que indique el entorno.

No necesitas instalar Node en tu computadora si usas un entorno de desarrollo en la nube.

## Configurar Supabase

1. Crea un proyecto en Supabase.
2. Ejecuta la migración SQL inicial en SQL Editor en un proyecto de desarrollo nuevo.
3. En Authentication, configura los métodos de inicio de sesión y crea el usuario administrador.
4. Inserta el perfil del administrador usando su UUID real en SQL Editor:
   ```sql
   insert into public.profiles(user_id, display_name, role)
   values ('UUID_REAL', 'Administrador Nica Decants', 'admin');
   ```
5. Copia Project URL y la publishable/anon key a `.env.local`.
6. Reinicia el servidor de desarrollo después de cambiar variables de entorno.

## Publicar con Vercel

1. Sube el proyecto a GitHub.
2. Importa el repositorio en Vercel.
3. Define `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en las variables de entorno de Vercel para los entornos que usarás.
4. Despliega y prueba inicio de sesión, permisos y consultas.

## Seguridad importante

- Solo usar la publishable/anon key en el navegador. Nunca usar `service_role`, claves secretas o la contraseña de base de datos en variables `VITE_*`.
- RLS no reemplaza los permisos SQL: ambas capas deben configurarse correctamente.
- Los empleados no deben poder cambiar su rol ni consultar las tablas privadas de costos.
- Las ventas, pagos, secuencias de factura e inventario deben escribirse mediante funciones RPC transaccionales validadas en el servidor.
- La factura PDF debe generarse a partir de una venta ya emitida; no debe ser el registro contable principal.
- No usar con datos reales hasta completar pruebas de autorización, stock concurrente, abonos, numeración de factura y recuperación de copias.

## Estado de esta entrega

- [x] App React inicial
- [x] Login por Supabase Auth
- [x] Lectura de perfil/rol, productos y clientes
- [x] La interfaz de empleado no muestra costos ni finanzas
- [x] Escrituras de ventas explícitamente no habilitadas
- [ ] RPC `create_sale` con numeración ND y descuento de inventario atómico
- [ ] RPC `record_payment` con validación de saldo
- [ ] Administración segura de productos, costos y movimientos
- [ ] Receta de decant con decremento de mililitros y alta de producto terminado
- [ ] PDF comercial, historial y cuentas por cobrar
- [ ] Pruebas automatizadas y despliegue productivo

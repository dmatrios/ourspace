# Our Space

Aplicación privada para dos personas. La primera entrega integra cuentas, vinculación por invitación, tareas personales y compartidas y una habitación 3D. El escritorio abre la misma lista de tareas que la vista tradicional. La casa muestra el progreso de las tareas compartidas.

## Desarrollo

Con Node.js 24 y npm:

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Configura la URL y la clave **publicable** del proyecto Supabase en `.env.local`. Si no están configuradas, la app muestra el estado de configuración pendiente. En el entorno en la nube puede usarse `npm ci --cache /tmp/ourspace-npm` si el caché predeterminado de npm no es escribible.

Para usar cuentas y persistencia, aplica las migraciones en orden primero en Supabase local o en un entorno de pruebas. La primera migración activa una lista privada de correos autorizados. Añade los dos correos en minúsculas desde una conexión administrativa al entorno correspondiente:

```sql
insert into private.allowed_emails (email)
values ('persona1@example.test'), ('persona2@example.test')
on conflict do nothing;
```

Activa el proveedor de correo y configura la URL de la aplicación en los redirects de Supabase Auth. Para confirmar el correo, abre el enlace en el mismo navegador donde creaste la cuenta. Mantén el registro por correo habilitado en Auth para que los correos de la lista puedan crear sus cuentas. Las migraciones y la configuración de producción requieren revisión aparte.

## Casa animada

Puedes tocar el suelo o usar las flechas para mover al avatar. Los botones de dirección también admiten las teclas de flecha cuando tienen el foco. El color de la ropa se guarda en este navegador por cuenta. La opción de movimiento reducido del teléfono también se aplica a la casa.

La decoración compartida (Bosque, Atardecer o Noche) se guarda en Supabase con una revisión para evitar sobrescribir cambios de la otra persona. Para habilitarla en una instalación con la primera migración aplicada, aplica `20261121000200_room_style.sql`. Mientras tanto, la casa funciona con la decoración Bosque.

## Desvinculación

Cualquiera de las dos personas puede abandonar la casa. Conserva sus tareas privadas y pierde acceso a la casa y sus tareas compartidas. Quien permanece puede conservar la casa con su historial o descargar un archivo JSON y confirmar el borrado de la casa y de las tareas compartidas. La casa conservada queda para uso individual.

La interfaz comprueba los cambios de la otra persona cada cinco segundos mientras la página está visible y también al recuperar el foco. Las operaciones de acceso se autorizan directamente en PostgreSQL.

## Verificación

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Las pruebas ejecutan la migración real en PostgreSQL embebido (PGlite) con identidades Auth simuladas. Cubren el acceso por correo autorizado, la expiración y consumo de invitaciones, la aprobación del propietario, el aislamiento de tareas y las dos salidas tras desvincularse. La confirmación por correo y la instalación en Android y iPhone requieren una prueba con Supabase y dispositivos reales.

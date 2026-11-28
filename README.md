# Our Space

Aplicación privada para dos personas. La primera entrega integra cuentas, vinculación por invitación, tareas personales y compartidas y una habitación 3D. Las tareas incluyen prioridad, fecha límite y requisitos, y se pueden editar desde el backlog. La casa muestra el progreso de las tareas compartidas y permite personalizar el avatar.

## Desarrollo

Con Node.js 24 y npm:

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Configura la URL y la clave **publicable** del proyecto Supabase en `.env.local`. Si no están configuradas, la app muestra el estado de configuración pendiente. En el entorno en la nube puede usarse `npm ci --cache /tmp/ourspace-npm` si el caché predeterminado de npm no es escribible.

Para usar cuentas y persistencia, aplica las migraciones en orden. La migración `20261126000100_open_email_registration.sql` desactiva el filtro de correos de la migración inicial y permite registrarse con cualquier correo. Mantén habilitados el registro por correo y **Confirm email** en Supabase Auth. Al registrarse, Our Space solicita un enlace de confirmación que vuelve al origen de la app; configura la URL de producción y `http://localhost:3000` en Site URL y Redirect URLs.

El SMTP predeterminado de Supabase solo entrega a miembros del equipo de la organización y limita los envíos. Para confirmar correos personales externos, configura un proveedor SMTP en Authentication. No desactives la confirmación para evitar este requisito: eso marcaría como verificados correos que no se han comprobado.

## Casa animada

Puedes tocar el suelo o usar las flechas para mover al avatar. Los botones de dirección también admiten las teclas de flecha cuando tienen el foco. El color de la ropa se guarda en este navegador por cuenta. La opción de movimiento reducido del teléfono también se aplica a la casa.

La decoración compartida (Bosque, Atardecer o Noche) se guarda en Supabase con una revisión para evitar sobrescribir cambios de la otra persona. Para habilitarla en una instalación con la primera migración aplicada, aplica `20261121000200_room_style.sql`. Mientras tanto, la casa funciona con la decoración Bosque.

## Bienvenida de pareja

Después de vincularse, cada integrante puede compartir su nombre, sus intereses y sus metas a corto y largo plazo. La fecha de inicio es compartida. Los campos se pueden editar desde **Su historia**. Aplica `20261121000300_couple_onboarding.sql` después de las migraciones anteriores para habilitar este flujo.

## Desvinculación

Cualquiera de las dos personas puede abandonar la casa. Conserva sus tareas privadas y pierde acceso a la casa y sus tareas compartidas. Quien permanece puede conservar la casa con su historial o descargar un archivo JSON y confirmar el borrado de la casa y de sus datos compartidos, incluida la bienvenida. La casa conservada queda para uso individual.

La interfaz comprueba los cambios de la otra persona cada cinco segundos mientras la página está visible y también al recuperar el foco. Las operaciones de acceso se autorizan directamente en PostgreSQL.

## Verificación

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Las pruebas con PostgreSQL embebido (PGlite) usan identidades Auth simuladas. Cubren la expiración y consumo de invitaciones, la aprobación del propietario, el aislamiento de tareas y las dos salidas tras desvincularse. La confirmación por correo y la instalación en Android y iPhone requieren una prueba con Supabase y dispositivos reales.

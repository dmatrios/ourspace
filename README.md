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

Cuando ambos integrantes abren la casa, ven los dos avatares y sus movimientos en vivo. La migración `20261127000500_live_room_presence.sql` autoriza un canal privado de Supabase Realtime únicamente para integrantes de una casa vinculada. Cada persona debe iniciar sesión y abrir la casa en su navegador para aparecer en ella; el movimiento no queda guardado como historial.

## Bienvenida de pareja

Después de vincularse, cada integrante puede compartir su nombre, sus intereses y sus metas a corto y largo plazo. La fecha de inicio es compartida. Los campos se pueden editar desde **Su historia**. Aplica `20261121000300_couple_onboarding.sql` después de las migraciones anteriores para habilitar este flujo.

## Desvinculación

Cualquiera de las dos personas puede abandonar la casa. Conserva sus tareas privadas y pierde acceso a la casa y sus tareas compartidas. Quien permanece puede conservar la casa con su historial o descargar un archivo JSON y confirmar el borrado de la casa y de sus datos compartidos, incluida la bienvenida. La casa conservada queda para uso individual.

La interfaz comprueba los cambios de la otra persona cada cinco segundos mientras la página está visible y también al recuperar el foco. Las operaciones de acceso se autorizan directamente en PostgreSQL.

## Gastos

En **Gastos** se pueden registrar y editar importes en PEN con fecha, categoría y descripción. Los gastos personales sólo los ve su titular; los compartidos se ven en la casa y permiten indicar cuál integrante pagó. La migración `20261127000400_expenses.sql` añade estas tablas y permisos. Los totales personales y compartidos se calculan por separado.

## Trabajo de reparto

En **Reparto**, cada integrante puede activar su propio rol de repartidor. Al activarlo se crean la plataforma PedidosYa y categorías iniciales, y se desbloquea la skin original **Repartidor Peya** en la casa. El rol, las jornadas y las finanzas de trabajo pertenecen a esa cuenta; la pareja sólo ve el avatar elegido en la casa compartida. Desactivar el rol conserva los registros y devuelve la ropa del avatar a la opción básica.

El módulo permite registrar plataformas y límite de efectivo, vehículo y odómetro, jornadas con pausas y corrección de horarios, cobros por efectivo/Yape/Plin/tarjeta, ingresos diarios o por jornada con historial de ediciones, gastos, categorías, recurrencias confirmadas, combustible y arqueo. Los reportes por día, semana y mes separan cobros de ingresos, muestran meta semanal y productividad, y descargan un PDF. Los borradores de cobros y gastos se guardan sólo al pulsar **Guardar borrador** en ese navegador y caducan a los siete días.

Aplica en orden `20261128000100_courier_role_avatar.sql`, `20261128000200_courier_work.sql` y `20261128000300_self_deletion.sql`. La cuenta se puede borrar desde **Mi cuenta** después de resolver las dependencias de una casa o gastos compartidos. El enlace de recuperación de contraseña usa el origen de la app como destino; comprueba que ese origen esté autorizado en Supabase Auth.

## Google Calendar

La conexión de Calendar es individual. En Google Cloud, habilita **Google Calendar API**, configura la pantalla de consentimiento OAuth y crea un cliente OAuth de tipo **Aplicación web**. Añade `http://localhost:3000` y `https://ourspace-amber.vercel.app` como orígenes JavaScript autorizados. Si la app OAuth está en modo de prueba, añade las dos cuentas como usuarios de prueba. Copia el ID público del cliente a `NEXT_PUBLIC_GOOGLE_CLIENT_ID` en `.env.local` y en las variables de entorno de Vercel; reinicia el servidor local y redespliega producción.

Cada persona pulsa **Conectar mi Google Calendar** en Tareas. Our Space sincroniza las tareas pendientes que tienen fecha en el calendario principal de esa persona: evento a las 9:00 a. m. de Lima y recordatorio emergente 30 minutos antes. Los cambios se sincronizan mientras la app está abierta y conectada. El acceso temporal vive solo en la memoria del navegador; al volver en otra sesión hay que reconectar. **Revocar acceso** elimina la autorización de Google, pero conserva los eventos que ya se crearon.

Consulta la [configuración oficial de OAuth web](https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid) y la [API de eventos de Calendar](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert).

## Verificación

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Las pruebas con PostgreSQL embebido (PGlite) usan identidades Auth simuladas. Cubren la expiración y consumo de invitaciones, la aprobación del propietario, el aislamiento de tareas y las dos salidas tras desvincularse. La confirmación por correo y la instalación en Android y iPhone requieren una prueba con Supabase y dispositivos reales.

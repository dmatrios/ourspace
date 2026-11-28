# Funciones de Rinde en Our Space

Referencia: [Rinde](https://github.com/dmatrios/Rinde), README de la iteración 6 y código local del 27/11/2026. Esta matriz registra funciones, no promete paridad por compartir tecnología. Los datos de trabajo serán personales; los gastos del hogar podrán ser compartidos.

| Función de Rinde | Estado en Our Space | Adaptación prevista |
| --- | --- | --- |
| Registro, confirmación e inicio de sesión | Implementado | Mantener Supabase Auth del hogar. |
| Recuperar y cambiar contraseña | Pendiente | Flujo de correo y pantalla de nueva contraseña. |
| Perfil editable y configuración de moneda/zona | Parcial | Nombre en bienvenida; añadir preferencias personales. |
| Plataformas de delivery | Pendiente | Módulo personal de trabajo, separado de la casa. |
| Jornadas, pausas, corrección de tiempos e historial | Pendiente | Módulo personal de trabajo con hora del servidor. |
| Kilometraje y vehículo | Pendiente | Datos personales de trabajo. |
| Ingresos diarios o por jornada e historial de cambios | Pendiente | Finanzas personales sin sumar cobros a ingresos dos veces. |
| Cobros en efectivo, Yape, Plin y tarjeta; vuelto | Pendiente | Caja de jornada dentro del módulo de trabajo. |
| Saldo, arqueo, límite de efectivo y cierre de jornada | Pendiente | Contabilidad de trabajo aislada del presupuesto del hogar. |
| Gastos y categorías personales | Parcial | Registro y edición con categorías iniciales; falta crear categorías propias. |
| Gastos compartidos y quién pagó | Implementado | Ambos integrantes pueden ver el gasto y quién pagó. |
| Gastos frecuentes y recurrentes | Pendiente | Confirmación explícita antes de registrar cada pago. |
| Combustible y consumo | Pendiente | Registro separado del gasto ordinario para evitar duplicados. |
| Reportes por día, semana y mes | Pendiente | Ingresos y gastos personales; resumen compartido por separado. |
| Metas semanales y productividad por hora o km | Pendiente | Metas de trabajo personales y metas del hogar con indicadores distintos. |
| Exportación de reportes a PDF | Pendiente | Descarga local desde las vistas de reportes. |
| Borradores locales de cobros y gastos | Pendiente | Por cuenta, con caducidad y guardado explícito. |
| Navegación móvil, estados vacíos y vista previa | Parcial | Our Space tiene estados vacíos y base móvil; falta navegación dedicada. |
| PWA e indicaciones de instalación | Parcial | Base PWA existente; falta guía de instalación. |
| Eliminación de cuenta con dependencias | Pendiente | Borrado personal y resolución explícita del hogar compartido. |

## Orden de portado

1. Gastos personales y compartidos, con importe decimal, fecha, categoría y pagador.
2. Preferencias personales, recuperación de cuenta y categorías/frecuentes.
3. Ingresos, reportes y metas financieras, con cálculos en céntimos.
4. Trabajo de delivery: plataformas, jornadas, pausas, cobros y caja.
5. Vehículo, combustible, odómetro y productividad.
6. PDF, borradores locales, navegación móvil y borrado de cuenta.

Rinde usa datos y reglas de una sola persona. Our Space debe conservar el aislamiento por usuario y aplicar permisos de pareja sólo a registros marcados como compartidos. No se copiarán tablas de Rinde directamente a la base de Our Space: las migraciones existentes de ambos productos tienen nombres y contratos distintos.

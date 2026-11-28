# Funciones de Rinde en Our Space

Referencia: [Rinde](https://github.com/dmatrios/Rinde), README de la iteración 6 y código consultado el 28/11/2026. Esta matriz registra funciones, no sustituye una prueba de extremo a extremo con cuentas reales. Los datos de trabajo son personales; los gastos del hogar pueden ser compartidos.

| Función de Rinde | Estado en Our Space | Adaptación prevista |
| --- | --- | --- |
| Registro, confirmación e inicio de sesión | Implementado | Mantener Supabase Auth del hogar. |
| Recuperar y cambiar contraseña | Implementado en código | Pendiente comprobar correo y enlace real con Supabase Auth. |
| Perfil editable y configuración de moneda/zona | Implementado en código | Nombre y modo de ingresos editables; PEN/America/Lima fijos como en Rinde. |
| Plataformas de delivery | Implementado en código | Predeterminada PedidosYa; gestión personal de otras plataformas. |
| Jornadas, pausas, corrección de tiempos e historial | Implementado en código | Transiciones y horas del servidor; odómetro en pausa/reanudación. |
| Kilometraje y vehículo | Implementado en código | Vehículo personal y lecturas por jornada. |
| Ingresos diarios o por jornada e historial de cambios | Implementado en código | Revisiones y separación de cobros individuales. |
| Cobros en efectivo, Yape, Plin y tarjeta; vuelto | Implementado en código | Vinculación por plataforma y horario de jornada. |
| Saldo, arqueo, límite de efectivo y cierre de jornada | Implementado en código | Caja y diferencia separadas de la ganancia. |
| Gastos y categorías personales | Implementado en código | Categorías propias, archivo y eliminación con reasignación. |
| Gastos compartidos y quién pagó | Implementado | Ambos integrantes pueden ver el gasto y quién pagó. |
| Gastos frecuentes y recurrentes | Implementado en código | Un pago recurrente necesita confirmación explícita. |
| Combustible y consumo | Implementado en código | Recargas separadas; consumo sólo si hay lecturas suficientes. |
| Reportes por día, semana y mes | Implementado en código | Totales por plataforma, categoría y día. |
| Metas semanales y productividad por hora o km | Implementado en código | Meta personal de reparto separada de las metas del hogar. |
| Exportación de reportes a PDF | Implementado en código | Descarga local desde Reportes. |
| Borradores locales de cobros y gastos | Implementado en código | Por cuenta, siete días, guardado explícito. |
| Navegación móvil, estados vacíos y vista previa | Implementado en código | Navegación inferior móvil y ruta pública `/preview` sin escritura. |
| PWA e indicaciones de instalación | Implementado en código | Base PWA y guía en Mi cuenta; falta prueba de instalación en dispositivos reales. |
| Eliminación de cuenta con dependencias | Implementado en código | Bloquea casas y gastos compartidos sin resolver; elimina datos personales. |

## Verificación pendiente

Las migraciones y pruebas PostgreSQL comprueban permisos y reglas principales. Falta recorrer con cuentas reales el registro, la recuperación, una jornada completa, el PDF, la instalación PWA y la casa en dos dispositivos. Hasta entonces no se declara paridad verificada en producción.

## Orden de portado

1. Gastos personales y compartidos, con importe decimal, fecha, categoría y pagador.
2. Preferencias personales, recuperación de cuenta y categorías/frecuentes.
3. Ingresos, reportes y metas financieras, con cálculos en céntimos.
4. Trabajo de delivery: plataformas, jornadas, pausas, cobros y caja.
5. Vehículo, combustible, odómetro y productividad.
6. PDF, borradores locales, navegación móvil y borrado de cuenta.

Rinde usa datos y reglas de una sola persona. Our Space debe conservar el aislamiento por usuario y aplicar permisos de pareja sólo a registros marcados como compartidos. No se copiarán tablas de Rinde directamente a la base de Our Space: las migraciones existentes de ambos productos tienen nombres y contratos distintos.

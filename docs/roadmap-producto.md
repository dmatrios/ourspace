# Roadmap de producto de Our Space

Esta lista recoge las funciones solicitadas para la app de pareja y el estado actual de cada entrega.

## Fase 1: bienvenida y navegación

- [x] Mostrar el onboarding personal en pasos: nombre preferido, preguntas personales, gustos e ideas de metas.
- [ ] Hacer más intuitivo el panel principal y dejar espacio para pantallas dedicadas sin comprimir los flujos.
- [ ] Mantener una navegación clara y cómoda en móvil y escritorio.

## Fase 2: tareas, metas y calendario

- [x] Backlog con prioridad, fecha, requisitos y recursos necesarios para completar cada tarea.
- [ ] Vistas de tareas para hoy, mañana y una fecha seleccionada, ordenadas por prioridad.
- [ ] Integración con Google Calendar y recordatorios, con autorización OAuth individual y revocable.
- [ ] Metas compartidas con porcentaje de avance, barra de progreso y reflejo del progreso en la casa.
- [ ] Recordatorios configurables, incluidos hábitos como el recordatorio diario de Duolingo.

## Fase 3: presencia y comunicación

- [ ] Presencia simultánea de ambos avatares y movimiento en vivo en el mismo espacio.
- [ ] Notificaciones entre integrantes, incluyendo “Te extraño”.
- [ ] Chat en tiempo real dentro de Our Space.
- [ ] Animaciones e interacciones de abrazo, beso y tomarse de la mano.
- [ ] Interacción humorística del chipotle chillón, con animación de encogerse.

## Fase 4: avatares, casa y recompensas

- [x] Personalizar cabello, forma/estilo del avatar y ropa.
- [ ] Desbloquear skins, logros y decoración por progreso de metas y tiempo de uso.
- [ ] Mover y colocar muebles y objetos en la casa compartida.

## Fase 5: herramientas para la vida en pareja

- [ ] Calendario interno para seguimiento del ciclo menstrual, privado por persona y opcional.
- [ ] Registro de gastos personales y gastos compartidos, con quién pagó cada gasto.
- [ ] Lista compartida de antojos de postres y comidas.
- [ ] Wishlist con enlaces y fotos.

## Auditoría de Rinde

- [ ] Revisar el repositorio Rinde y preparar una matriz de funciones presentes, faltantes y adaptables antes de afirmar que Our Space tiene paridad completa.
- [ ] Implementar las funciones reutilizables que sigan siendo relevantes, manteniendo la identidad y los flujos propios de Our Space.

## Dependencias de diseño

- Los recordatorios, “Te extraño” y las notificaciones de chat deben usar una base común de preferencias y entrega.
- Google Calendar requiere consentimiento OAuth por cuenta y una opción clara para revocar el acceso.
- Los datos del ciclo menstrual y los gastos personales necesitan permisos separados de los datos compartidos del hogar.
- La casa, los avatares y las recompensas deben consumir el mismo progreso de metas para evitar sistemas de puntos duplicados.

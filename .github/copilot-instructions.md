# Directrices Generales del Proyecto para GitHub Copilot

Este proyecto utiliza la siguiente pila tecnológica principal:
- **Framework:** Qwik (con un fuerte énfasis en Full Server-Side Rendering - SSR y Resumability)
- **Base de Datos:** Turso (una base de datos distribuida compatible con libSQL/SQLite)
- **Estilizado:** Tailwind CSS
- **Testing Unitario/Componentes:** Vitest con `@testing-library/qwik`
- **Testing End-to-End (E2E):** Playwright

## Principios Clave del Proyecto:
1.  **Qwik First:** Priorizar las primitivas y patrones de Qwik (`component$`, `useSignal$`, `useStore$`, `Resource`, `routeLoader$`, `routeAction$`, `server$`).
2.  **Full SSR y Resumability:** El código debe ser escrito pensando en la resumabilidad. Evitar patrones que rompan la capacidad de Qwik de pausar en el servidor y resumir en el cliente sin re-ejecución.
3.  **Tailwind CSS para Estilos:** Utilizar clases de utilidad de Tailwind CSS directamente en el JSX. Evitar CSS global o CSS-in-JS a menos que sea estrictamente necesario y discutido.
4.  **Acceso a Datos con Turso:** Las interacciones con la base de datos Turso deben realizarse exclusivamente en el servidor, típicamente dentro de `routeLoader$`, `routeAction$` o `server$`. Utilizar el cliente `@libsql/client`.
5.  **Testing Riguroso:**
    *   Escribir tests unitarios (Vitest) para lógica pura y funciones de utilidad.
    *   Escribir tests de componentes (Vitest + `@testing-library/qwik`) para verificar el renderizado, estado y comportamiento de los componentes Qwik en un entorno simulado.
    *   Escribir tests E2E (Playwright) para los flujos críticos del usuario, verificando la integración completa y la resumabilidad en navegadores reales.
6.  **Manejo de Variables de Entorno (Qwik):**
    *   Variables públicas (cliente y servidor): `PUBLIC_NOMBRE_VAR` accesibles con `import.meta.env.PUBLIC_NOMBRE_VAR`. **NO USAR PARA DATOS SENSIBLES.**
    *   Variables de servidor: Accesibles en `routeLoader$`, `routeAction$`, `server$`, etc., a través de `requestEvent.env.get('NOMBRE_VAR_SECRETA')`. Aquí van las claves de API de Turso, etc.
    *   Evitar `process.env`.
7.  **Funciones Exclusivas de Servidor (`server$`):** Utilizar `server$()` para RPCs fuertemente tipadas desde el cliente al servidor. Acceder a `RequestEvent` con `this` dentro de estas funciones para obtener `env`, `cookie`, `url`, `headers`.
8.  **Estructura de Componentes Qwik:**
    *   Usar `component$(() => { ... })` para definir componentes.
    *   Manejar eventos con el sufijo `$` (e.g., `onClick$={$(async () => { ... })}`). Asegurarse de que los manejadores estén envueltos en `$()`.
9.  **Optimización:** Considerar siempre el impacto en el bundle y la performance. Aprovechar el lazy loading y la resumabilidad de Qwik.
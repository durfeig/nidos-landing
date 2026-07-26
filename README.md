# Nidos · Landing de validación de PMF

Landing funcional para medir product-market fit de Nidos (plataforma de acceso
a vivienda compartida). HTML/CSS/JS puro: **no requiere instalación, build ni
dependencias**. Se sube tal cual a cualquier hosting estático.

Proyecto del New Business Lab · MiM UdeSA · Grupo 29 (Matías Martinez, Diego Urfeig).

---

## Qué mide

| Pregunta de validación | Cómo la responde la landing |
|---|---|
| ¿Qué mensaje convierte más? | A/B test del hero: **A** = eje compañía (mockup) vs **B** = eje acceso (Módulo 4) |
| ¿Hay demanda real? | Captura de email + funnel de onboarding de 6 pasos |
| ¿Cuál es la barrera dominante? | Pregunta directa de barrera (garantía / adelanto / desconfianza / precio / oferta) |
| ¿Pagarían? ¿Cuánto? | Preguntas de WTP con precios calculados sobre el presupuesto que declara cada visitante |
| ¿Qué subsegmento de oferta conviene? | Puerta "Tengo lugar para compartir" con los 5 subsegmentos del Doc #3 |

## Puesta en marcha (3 pasos, ~10 minutos)

### 1. Crear la base en Supabase
1. Creá un proyecto gratis en [supabase.com](https://supabase.com).
2. Andá a **SQL Editor → New query**, pegá TODO el contenido de
   [`supabase-schema.sql`](supabase-schema.sql) y ejecutá (**Run**).
3. Listo: tablas `leads`, `respuestas`, `eventos` + vistas de análisis.

### 2. Conectar la landing
En [`assets/config.js`](assets/config.js) completá las dos primeras claves
(las sacás de Supabase → **Settings → API**):

```js
SUPABASE_URL: 'https://TUPROYECTO.supabase.co',
SUPABASE_ANON_KEY: 'eyJhbGciOi...',
```

> **¿Es seguro publicar la anon key?** Sí. El esquema SQL activa RLS con
> políticas de **solo INSERT** para la clave anónima: desde el navegador se
> pueden agregar filas pero nadie puede leer los emails capturados ni
> modificar/borrar nada. Vos leés todo desde el dashboard de Supabase.

### 3. Publicar
La carpeta `nidos-landing/` completa se sube tal cual:

- **Netlify:** [app.netlify.com/drop](https://app.netlify.com/drop) → arrastrá la carpeta. Listo.
- **Vercel:** `vercel deploy` dentro de la carpeta, o importala desde el dashboard.
- **GitHub Pages / cualquier hosting estático:** también funciona.

Para probar local antes de publicar:

```bash
python3 -m http.server 4321
```

y abrí `http://localhost:4321`.

## El test A/B

Cada visitante ve una de dos variantes (50/50, estable por navegador):

- **A · eje compañía:** "Encontrá tu compañero ideal. Encontrá tu nido."
- **B · eje acceso:** "El mercado de alquileres te dejó afuera. Nidos te deja entrar."

Para revisar cada variante forzala por URL: `?v=A` o `?v=B`.
Para publicar una sola, cambiá `AB_MODE` en `config.js` a `'A'` o `'B'`.

**La métrica que decide:** vista `v_ab_test` en Supabase → `conv_lead_pct`
(visitantes → emails) y `conv_onboarding_pct` (emails → onboarding completo).

## Cómo leer los resultados

En Supabase → **Table Editor** (o SQL Editor) tenés 5 vistas listas:

| Vista | Qué responde |
|---|---|
| `v_leads` | Un lead por fila con todas sus respuestas pivoteadas. **Esta es la tabla que exportás a CSV para el entregable.** |
| `v_ab_test` | Conversión por variante: qué mensaje gana. |
| `v_dropoff` | En qué paso del onboarding se cae la gente. |
| `v_barreras` | Ranking de barreras declaradas (valida la tesis del Módulo 3: ¿es exclusión estructural o precio?). |
| `v_wtp` | Disposición a pagar por cada flujo de monetización del Doc #3. |

Exportar: abrí la vista en SQL Editor (`select * from v_leads`) → **Download CSV**.

## Campañas y atribución

La landing captura automáticamente `utm_source`, `utm_medium`, `utm_campaign`
y el referrer. Ejemplo de URL para una campaña de Instagram:

```
https://tudominio.com/?utm_source=instagram&utm_medium=paid&utm_campaign=pmf_test
```

### Analítica opcional
En `config.js` podés pegar IDs de:
- **Microsoft Clarity** (`CLARITY_ID`) — mapas de calor y grabaciones de sesión, gratis. Recomendado.
- **Google Analytics 4** (`GA4_ID`)
- **Meta Pixel** (`META_PIXEL_ID`) — necesario si vas a correr ads en Instagram/Facebook y optimizar por conversión.

Además la landing registra sus propios eventos en la tabla `eventos`:
`page_view`, `lead_capturado`, `step_view`, `step_complete`,
`onboarding_completo`, `onboarding_abandonado`, `seccion_vista`, `click_cta`.

## Modo demo (sin Supabase)

Si `SUPABASE_URL` queda vacío, la landing funciona igual: guarda todo en el
navegador. Con **Ctrl+Shift+D** bajás un CSV con los datos capturados en ese
navegador. Útil para probar el funnel o para una demo en clase.

Este mismo guardado local corre siempre como respaldo: si Supabase falla en
medio de una campaña, los datos del visitante no bloquean el formulario.

## Decisiones de diseño (y por qué difiere del mockup)

1. **Sin prueba social inventada.** El mockup tenía "4.8/5 en más de 1.200
   reseñas"; publicar eso siendo una idea en validación es engañoso y
   contamina la señal. Se reemplazó por 4 datos duros del mercado con fuente.
2. **Sin contraseña.** No hay producto, así que no hay cuenta que crear.
   Pedir contraseña mataría la conversión y crearía un riesgo de seguridad
   innecesario. El CTA es una lista de espera real.
3. **Honestidad sobre el estado.** La primera FAQ dice explícitamente que
   Nidos todavía no opera y el footer aclara que es un proyecto académico en
   validación. Quien deja el email igual, es una señal de demanda más fuerte.
4. **Precios en contexto.** Las preguntas de WTP no muestran números
   abstractos: calculan la garantía y el adelanto sobre el presupuesto que la
   persona declaró dos pasos antes (supuestos económicos en `config.js`).

## Estructura

```
nidos-landing/
├── index.html            página completa (incluye el modal de onboarding)
├── supabase-schema.sql   tablas + RLS + vistas de análisis
├── README.md
└── assets/
    ├── config.js         ← lo único que editás
    ├── styles.css
    ├── app.js            variantes, funnel, tracking, Supabase
    └── hero.jpg
```

/* =============================================================================
 * NIDOS · Configuración
 * -----------------------------------------------------------------------------
 * Lo único que necesitás editar para que la landing capture datos de verdad
 * son las dos primeras líneas de SUPABASE.
 * ========================================================================== */

window.NIDOS_CONFIG = {

  /* ---------------------------------------------------------------------------
   * 1. SUPABASE  (obligatorio para capturar leads)
   * Settings → API en tu proyecto. La anon key es pública y va acá sin riesgo:
   * el esquema SQL solo le permite INSERT, no puede leer nada.
   * Si las dejás vacías, la landing funciona igual en "modo demo": guarda todo
   * en el navegador y podés bajar un CSV con Ctrl+Shift+D.
   * ------------------------------------------------------------------------ */
  SUPABASE_URL: 'https://lhccxddwazmcyjpggrzj.supabase.co', 
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxoY2N4ZGR3YXptY3lqcGdncnpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwODM2MzIsImV4cCI6MjEwMDY1OTYzMn0.WcEFTN3Hj1h-wOobUbvEFpMgaHhmAVx4sAma1COjECE',

  /* ---------------------------------------------------------------------------
   * 2. TEST A/B del mensaje del hero
   * 'auto'  → 50/50 estable por visitante (guardado en localStorage)
   * 'A'     → fuerza el eje compañía (mockup original)
   * 'B'     → fuerza el eje acceso (conclusión del Módulo 4)
   * También podés forzarlo por URL para revisar: ?v=A  o  ?v=B
   * ------------------------------------------------------------------------ */
  AB_MODE: 'auto',

  /* ---------------------------------------------------------------------------
   * 3. MODELO VIGENTE · FASE 1  (Módulo 6 y Módulo 7 v4 · pricing VI.2)
   * Principio: Nidos nunca cobra por buscar ni por el acceso. Cobra solo si hay
   * mudanza. Se usan para calcular en vivo los precios del prototipo (/demo) y
   * la calculadora de la landing según el alquiler de cada persona.
   * ------------------------------------------------------------------------ */
  TC_USD: 1560,                    // ARS por USD (BNA venta, 29/10/2026)
  PRECIO_PACK_USD: 100,            // Pack Mudanza Segura, una vez, al cierre
  SUCCESS_FEE_PCT: 0.10,           // al oferente: 10% de un mes, solo si hay cierre
  PRECIO_PAGOS_USD: 4,             // opcional: Pagos Nidos + Club, por hogar y por mes
  MESES_ADELANTO_SIN_GARANTIA: 6,  // lo que hoy piden sin garantía propietaria

  /* ---------------------------------------------------------------------------
   * 3b. PRECIOS DEL CUESTIONARIO DE VALIDACIÓN  (Doc #3 · NO es el modelo vigente)
   * Solo los usa el paso de disposición a pagar del registro (app.js), que mide
   * contra estos precios y alimenta la vista v_wtp de Supabase. Cambiarlos
   * rompe la comparabilidad de las respuestas ya capturadas.
   * La garantía digital pasó a la fase 2: la emite una aseguradora autorizada
   * y Nidos origina la operación (comisión ~20% de la prima), no la emite.
   * ------------------------------------------------------------------------ */
  PRECIO_SUSCRIPCION_USD: 15,      // premium del buscador (fase 2)
  PRECIO_VISIBILIDAD_USD: 12,      // plan de visibilidad del oferente
  PRECIO_CONTRATO_USD: 25,         // contrato digital, flat
  GARANTIA_PCT_ANUAL: 0.06,        // garantía digital: 6% del alquiler anual
  COMISION_GARANTIA_PCT: 0.20,     // parte de la prima que retiene Nidos (fase 2)

  /* ---------------------------------------------------------------------------
   * 4. ANALÍTICA  (opcional · dejá vacío lo que no uses)
   * ------------------------------------------------------------------------ */
  CLARITY_ID: 'xt34c5j6y7',      // Microsoft Clarity → Settings → Project ID
  GA4_ID: 'G-G7FTNMSYYS',          // ej: 'G-XXXXXXXXXX'
  META_PIXEL_ID: '',   // ej: '1234567890'

  /* ---------------------------------------------------------------------------
   * 5. CONTACTO
   * ------------------------------------------------------------------------ */
  EMAIL_CONTACTO: 'durfeig@udesa.edu.ar',

  /* ---------------------------------------------------------------------------
   * 6. CONTADOR DE LISTA DE ESPERA
   * Número desde el que arranca la posición que se le muestra a cada persona.
   * Dejalo en 0 para mostrar el conteo real y crudo. No inventes prueba social:
   * si la campaña recién arranca, un número honesto es más creíble que uno alto.
   * ------------------------------------------------------------------------ */
  WAITLIST_OFFSET: 0
};
